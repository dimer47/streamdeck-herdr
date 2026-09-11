import streamDeck, { SingletonAction } from "@elgato/streamdeck";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";

// ── Le plugin n'hérite pas du PATH du shell : on résout le binaire nous-mêmes.
const CANDIDATS = ["/opt/homebrew/bin/herdr", "/usr/local/bin/herdr"];
const HERDR = CANDIDATS.find(existsSync) ?? "herdr";
const ENV = { ...process.env, PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH ?? ""}` };

/** Lance herdr. Ne jette jamais : une commande en échec doit alerter, pas tuer le plugin. */
function herdr(args, timeout = 5000) {
  return new Promise((resolve) => {
    execFile(HERDR, args, { env: ENV, timeout }, (err, stdout) => {
      const brut = (stdout ?? "").trim();
      if (err && !brut) return resolve({ ok: false, json: null, brut: "" });
      try {
        resolve({ ok: !err, json: JSON.parse(brut), brut });
      } catch {
        resolve({ ok: !err, json: null, brut });
      }
    });
  });
}

const notifier = (titre, corps) =>
  herdr(["notification", "show", titre, "--body", String(corps).slice(0, 400), "--sound", "none"]);

const agents = async () => (await herdr(["agent", "list"])).json?.result?.agents ?? [];
const spaces = async () => {
  const l = (await herdr(["workspace", "list"])).json?.result?.workspaces ?? [];
  return l.sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
};
const enLigne = async () => (await herdr(["workspace", "list"])).json !== null;
const spaceFocalise = async () => (await spaces()).find((w) => w.focused) ?? null;

/** Agent du space focalisé, sinon premier agent dans l'état voulu. */
async function cibleAgent(etatPrefere) {
  const l = await agents();
  if (l.length === 0) return null;
  if (etatPrefere) {
    const m = l.find((a) => a.status === etatPrefere);
    if (m) return m.name ?? m.pane_id;
  }
  const ws = await spaceFocalise();
  const ici = ws && l.find((a) => a.workspace_id === ws.workspace_id);
  return (ici ?? l[0]).name ?? (ici ?? l[0]).pane_id;
}

/**
 * Base commune : rafraîchit le titre des touches visibles.
 * Le minuteur ne tourne que tant qu'au moins une touche de ce type est affichée.
 */
class Base extends SingletonAction {
  #timer = null;
  periode = 3000;

  async onWillAppear(ev) {
    if (this.etat && !this.#timer) this.#timer = setInterval(() => this.rafraichir(), this.periode);
    if (this.etat) await this.peindre(ev.action, await this.etat());
  }
  onWillDisappear() {
    if ([...this.actions].length === 0 && this.#timer) {
      clearInterval(this.#timer);
      this.#timer = null;
    }
  }
  async rafraichir() {
    const visibles = [...this.actions];
    if (visibles.length === 0) return this.onWillDisappear();
    const e = await this.etat();
    await Promise.all(visibles.map((a) => this.peindre(a, e)));
  }
  /** Exécute, signale le résultat, puis rafraîchit l'affichage. */
  async lancer(ev, args, timeout) {
    const r = await herdr(args, timeout);
    await (r.ok ? ev.action.showOk() : ev.action.showAlert());
    if (this.etat) await this.rafraichir();
    return r;
  }
}

/**
 * Confirme uniquement si le réglage de la touche le demande.
 * `defaut` fixe le comportement tant que l'utilisateur n'a rien coché :
 * un pane ou un onglet se rouvre en un geste, un space ou un worktree non.
 */
async function autorise(ev, question, bouton, defaut) {
  const s = await ev.action.getSettings();
  const demander = s?.confirmer ?? defaut;
  if (!demander) return true;
  return confirmer(question, bouton);
}

/* ══════════════════ AGENTS ══════════════════ */

class AgentsEtat extends Base {
  manifestId = "com.dimer47.herdr.agents-status";
  async etat() {
    if (!(await enLigne())) return { off: true };
    const l = await agents();
    const n = (s) => l.filter((a) => a.status === s).length;
    return { total: l.length, bloques: n("blocked"), actifs: n("working"), prets: n("idle") + n("done") };
  }
  async peindre(a, e) {
    if (!e || e.off) return a.setTitle("Agents\noffline");
    if (e.total === 0) return a.setTitle("No\nagents");
    return a.setTitle(`${e.bloques}⎋ ${e.actifs}▶ ${e.prets}✓\nAgents`);
  }
  async onKeyDown(ev) {
    const l = await agents();
    if (l.length === 0) return ev.action.showAlert();
    await notifier(`Agents (${l.length})`, l.slice(0, 6).map((a) => `${a.name ?? a.pane_id}: ${a.status}`).join("\n"));
    return ev.action.showOk();
  }
}

class AgentDebloquer extends Base {
  manifestId = "com.dimer47.herdr.agent-unblock";
  async etat() {
    if (!(await enLigne())) return { off: true };
    return { bloques: (await agents()).filter((a) => a.status === "blocked").length };
  }
  async peindre(a, e) {
    if (!e || e.off) return a.setTitle("Unblock\noffline");
    return a.setTitle(e.bloques > 0 ? `⎋ ${e.bloques} blocked\nUnblock` : "0 blocked\nUnblock");
  }
  async onKeyDown(ev) {
    const cible = await cibleAgent("blocked");
    if (!cible) return ev.action.showAlert();
    return this.lancer(ev, ["agent", "send-keys", cible, "esc"]);
  }
}

class AgentValider extends Base {
  manifestId = "com.dimer47.herdr.agent-enter";
  async onKeyDown(ev) {
    const cible = await cibleAgent("blocked");
    if (!cible) return ev.action.showAlert();
    return this.lancer(ev, ["agent", "send-keys", cible, "enter"]);
  }
}

class AgentRelancer extends Base {
  manifestId = "com.dimer47.herdr.agent-continue";
  async onKeyDown(ev) {
    const cible = await cibleAgent("idle");
    if (!cible) return ev.action.showAlert();
    return this.lancer(ev, ["agent", "prompt", cible, "Continue."], 20000);
  }
}

class AgentInterrompre extends Base {
  manifestId = "com.dimer47.herdr.agent-stop";
  async onKeyDown(ev) {
    const cible = await cibleAgent(null);
    if (!cible) return ev.action.showAlert();
    return this.lancer(ev, ["agent", "send-keys", cible, "ctrl+c"]);
  }
}

class AgentVoirBloque extends Base {
  manifestId = "com.dimer47.herdr.agent-focus";
  async etat() {
    if (!(await enLigne())) return { off: true };
    const l = await agents();
    return { attente: l.filter((a) => ["blocked", "done", "idle"].includes(a.status)).length };
  }
  async peindre(a, e) {
    if (!e || e.off) return a.setTitle("Show blocked\noffline");
    return a.setTitle(e.attente > 0 ? `${e.attente} waiting\nShow blocked` : "0 waiting\nShow blocked");
  }
  async onKeyDown(ev) {
    const l = await agents();
    const c = l.find((a) => a.status === "blocked") ?? l.find((a) => a.status === "done") ?? l.find((a) => a.status === "idle");
    if (!c) return ev.action.showAlert();
    return this.lancer(ev, ["agent", "focus", c.name ?? c.pane_id]);
  }
}

/* ══════════════════ SPACES ══════════════════ */

/** Rotation circulaire sur les workspaces. */
async function tourner(sens) {
  const l = await spaces();
  if (l.length === 0) return false;
  const i = l.findIndex((w) => w.focused);
  const cible = l[((((i < 0 ? 0 : i) + sens) % l.length) + l.length) % l.length];
  return (await herdr(["workspace", "focus", cible.workspace_id])).ok;
}

class SpaceLabel extends Base {
  async etat() {
    if (!(await enLigne())) return { off: true };
    return { label: (await spaceFocalise())?.label ?? null };
  }
}

class SpaceSuivant extends SpaceLabel {
  manifestId = "com.dimer47.herdr.ws-next";
  async peindre(a, e) {
    return a.setTitle(e?.label ? `▶ ${e.label.slice(0, 9)}\nNext space` : "Next\nspace");
  }
  async onKeyDown(ev) {
    await ((await tourner(1)) ? ev.action.showOk() : ev.action.showAlert());
    return this.rafraichir();
  }
}

class SpacePrecedent extends SpaceLabel {
  manifestId = "com.dimer47.herdr.ws-prev";
  async peindre(a, e) {
    return a.setTitle(e?.label ? `◀ ${e.label.slice(0, 9)}\nPrev. space` : "Prev.\nspace");
  }
  async onKeyDown(ev) {
    await ((await tourner(-1)) ? ev.action.showOk() : ev.action.showAlert());
    return this.rafraichir();
  }
}


class SpaceNouveau extends Base {
  manifestId = "com.dimer47.herdr.ws-new";
  async onKeyDown(ev) {
    const d = await dossierChoisi("Folder for the new space");
    if (!d) return;
    const label = d.replace(/\/$/, "").split("/").pop();
    return this.lancer(ev, ["workspace", "create", "--cwd", d, "--label", label, "--focus"], 15000);
  }
}

class SpaceFermer extends Base {
  manifestId = "com.dimer47.herdr.ws-close";
  async onKeyDown(ev) {
    const ws = await spaceFocalise();
    if (!ws) return ev.action.showAlert();
    if (!(await autorise(ev, `Close space "${ws.label}"?`, "Close", false))) return;
    const r = await herdr(["workspace", "close", ws.workspace_id]);
    if (!r.ok) await notifier("Herdr", "Failed — linked worktree? (--group required)");
    return (r.ok ? ev.action.showOk() : ev.action.showAlert());
  }
}

/* ══════════════════ WORKTREES ══════════════════ */


class WorktreeCreer extends Base {
  manifestId = "com.dimer47.herdr.wt-new";
  async onKeyDown(ev) {
    const depot = await dossierChoisi("Base Git repository");
    if (!depot) return;
    const branche = await saisie("Branch name:", "feat/");
    if (!branche) return;
    const base = (await saisie("Base branch:", "origin/main")) || "origin/main";
    const label = branche.split("/").pop();
    const r = await herdr(["worktree", "create", "--cwd", depot, "--branch", branche, "--base", base, "--label", label, "--focus"], 30000);
    if (!r.ok) await notifier("Herdr — failed", r.json?.error?.message ?? r.brut ?? "échec");
    return (r.ok ? ev.action.showOk() : ev.action.showAlert());
  }
}

class WorktreeRetirer extends Base {
  manifestId = "com.dimer47.herdr.wt-remove";
  async onKeyDown(ev) {
    const ws = await spaceFocalise();
    if (!ws) return ev.action.showAlert();
    if (!(await autorise(ev, `Remove worktree of space "${ws.label}"?`, "Remove", true))) return;
    const r = await herdr(["worktree", "remove", "--workspace", ws.workspace_id], 20000);
    if (!r.ok) await notifier("Herdr", "Failed — uncommitted changes?");
    return r.ok ? ev.action.showOk() : ev.action.showAlert();
  }
}

/* ══════════════════ PANES ══════════════════ */

class PaneSplitDroite extends Base {
  manifestId = "com.dimer47.herdr.pane-split-right";
  onKeyDown(ev) {
    return this.lancer(ev, ["pane", "split", "--direction", "right"]);
  }
}

/** Les quatre focus directionnels ne diffèrent que par la direction. */
class PaneFocus extends Base {
  constructor(direction) {
    super();
    this.direction = direction;
    this.manifestId = `com.dimer47.herdr.pane-focus-${direction}`;
  }
  onKeyDown(ev) {
    return this.lancer(ev, ["pane", "focus", "--direction", this.direction]);
  }
}

class PaneLire extends Base {
  manifestId = "com.dimer47.herdr.pane-read";
  async onKeyDown(ev) {
    const pane = (await herdr(["pane", "current"])).json?.result?.pane?.pane_id;
    if (!pane) return ev.action.showAlert();
    const r = await herdr(["pane", "read", pane, "--source", "recent-unwrapped", "--lines", "200"], 10000);
    const texte = r.json?.result?.content ?? r.json?.result?.text ?? "";
    if (!texte) return ev.action.showAlert();
    await presserPapiers(texte);
    await notifier("Herdr", `output of ${pane} copied`);
    return ev.action.showOk();
  }
}
class PaneSplitBas extends Base {
  manifestId = "com.dimer47.herdr.pane-split-down";
  onKeyDown(ev) {
    return this.lancer(ev, ["pane", "split", "--direction", "down"]);
  }
}
class PaneZoom extends Base {
  manifestId = "com.dimer47.herdr.pane-zoom";
  onKeyDown(ev) {
    return this.lancer(ev, ["pane", "zoom", "--toggle"]);
  }
}

/* ══════════════════ ONGLETS ══════════════════ */


class OngletNouveau extends Base {
  manifestId = "com.dimer47.herdr.tab-new";
  onKeyDown(ev) {
    return this.lancer(ev, ["tab", "create", "--focus"]);
  }
}

class OngletFermer extends Base {
  manifestId = "com.dimer47.herdr.tab-close";
  async onKeyDown(ev) {
    const ws = await spaceFocalise();
    if (!ws?.active_tab_id) return ev.action.showAlert();
    if (!(await autorise(ev, `Close tab ${ws.active_tab_id}?`, "Close", false))) return;
    return this.lancer(ev, ["tab", "close", ws.active_tab_id]);
  }
}

/* ══════════════════ SYSTÈME ══════════════════ */

class ServeurEtat extends Base {
  manifestId = "com.dimer47.herdr.server";
  periode = 5000;
  async etat() {
    return { vivant: await enLigne() };
  }
  async peindre(a, e) {
    return a.setTitle(e?.vivant ? "Server\nactive" : "Server\nstopped");
  }
  async onKeyDown(ev) {
    const r = await herdr(["status"]);
    const ligne = (motif) => r.brut.split("\n").find((l) => l.includes(motif))?.split(":").pop()?.trim() ?? "?";
    await notifier("Herdr server", `${ligne("status")} — version ${ligne("version")}`);
    return ev.action.showOk();
  }
}

class OuvrirHerdr extends Base {
  manifestId = "com.dimer47.herdr.open-herdr";
  async onKeyDown(ev) {
    await osa('tell application "Terminal" to do script "herdr"');
    await osa('tell application "Terminal" to activate');
    return ev.action.showOk();
  }
}



/** État des intégrations ; `--outdated-only` pour la variante obsolètes. */




class PaneFermer extends Base {
  manifestId = "com.dimer47.herdr.pane-close";
  async onKeyDown(ev) {
    const pane = (await herdr(["pane", "current"])).json?.result?.pane?.pane_id;
    if (!pane) return ev.action.showAlert();
    if (!(await autorise(ev, `Close pane ${pane}?`, "Close", false))) return;
    return this.lancer(ev, ["pane", "close", pane]);
  }
}

/** Rotation circulaire sur les onglets du space focalisé. */
class OngletNav extends Base {
  constructor(sens) {
    super();
    this.sens = sens;
    this.manifestId = sens > 0 ? "com.dimer47.herdr.tab-next" : "com.dimer47.herdr.tab-prev";
  }
  async onKeyDown(ev) {
    const ws = await spaceFocalise();
    if (!ws) return ev.action.showAlert();
    const l = (await herdr(["tab", "list", "--workspace", ws.workspace_id])).json?.result?.tabs ?? [];
    if (l.length < 2) return ev.action.showAlert();
    const i = l.findIndex((t) => t.tab_id === ws.active_tab_id);
    const cible = l[((((i < 0 ? 0 : i) + this.sens) % l.length) + l.length) % l.length];
    return this.lancer(ev, ["tab", "focus", cible.tab_id]);
  }
}

/* ══════════════════ GÉNÉRIQUE (dernier recours) ══════════════════ */

class CommandeLibre extends SingletonAction {
  manifestId = "com.dimer47.herdr.command";
  async onWillAppear(ev) {
    const s = await ev.action.getSettings();
    if (s?.libelle) await ev.action.setTitle(s.libelle);
  }
  async onKeyDown(ev) {
    const s = await ev.action.getSettings();
    const args = (s?.args ?? "").trim();
    if (!args) return ev.action.showAlert();
    const decoupe = args.match(/"[^"]*"|'[^']*'|\S+/g)?.map((t) => t.replace(/^["']|["']$/g, "")) ?? [];
    const r = await herdr(decoupe, 15000);
    await (r.ok ? ev.action.showOk() : ev.action.showAlert());
    if (s?.notifier && r.brut) await notifier(s.libelle || "Herdr", r.brut);
  }
}

/* ══════════════════ Dialogues macOS ══════════════════ */

function osa(script, timeout = 60000) {
  return new Promise((resolve) => {
    execFile("/usr/bin/osascript", ["-e", script], { env: ENV, timeout }, (err, stdout) => {
      resolve(err ? null : (stdout ?? "").trim());
    });
  });
}
/** Copie dans le presse-papiers via pbcopy (stdin, pour ne pas buter sur la taille). */
function presserPapiers(texte) {
  return new Promise((resolve) => {
    const p = execFile("/usr/bin/pbcopy", { env: ENV }, () => resolve());
    p.stdin.end(texte);
  });
}

const dossierChoisi = (invite) =>
  osa(`POSIX path of (choose folder with prompt "${invite.replace(/"/g, "")}")`);
const saisie = (invite, defaut) =>
  osa(`text returned of (display dialog "${invite.replace(/"/g, "")}" default answer "${defaut}" with title "Herdr")`);
const confirmer = async (question, bouton) => {
  const r = await osa(
    `button returned of (display dialog "${question.replace(/"/g, "")}" buttons {"Cancel","${bouton}"} default button "Cancel" with title "Herdr")`,
  );
  return r === bouton;
};

/* ══════════════════ Enregistrement ══════════════════ */

const ACTIONS = [
  new AgentsEtat(), new AgentDebloquer(), new AgentValider(), new AgentRelancer(),
  new AgentInterrompre(), new AgentVoirBloque(),
  new SpaceSuivant(), new SpacePrecedent(), new SpaceNouveau(), new SpaceFermer(),
  new WorktreeCreer(), new WorktreeRetirer(),
  new PaneSplitDroite(), new PaneSplitBas(), new PaneZoom(), new PaneFermer(),
  new PaneFocus("left"), new PaneFocus("right"), new PaneFocus("up"), new PaneFocus("down"),
  new PaneLire(),
  new OngletNouveau(), new OngletFermer(), new OngletNav(-1), new OngletNav(1),
  new ServeurEtat(), new OuvrirHerdr(),
  new CommandeLibre(),
];
for (const a of ACTIONS) streamDeck.actions.registerAction(a);

streamDeck.logger.info("binaire herdr : " + HERDR);
streamDeck.logger.info(ACTIONS.length + " actions enregistrées");
streamDeck.connect().then(
  () => streamDeck.logger.info("connecté à Stream Deck"),
  (e) => streamDeck.logger.error("échec de connexion : " + e),
);
