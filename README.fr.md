<p align="center">
  <img src="docs/herdr-logo.png" width="128" alt="Herdr">
</p>

<h1 align="center">Herdr pour Stream Deck</h1>

<p align="center">
  Pilotez <a href="https://herdr.dev">Herdr</a> — le multiplexeur de terminal pour agents
  de codage IA — depuis votre Elgato Stream Deck.
  <br>
  <em><a href="README.md">🇬🇧 English version</a></em>
</p>

---

## À quoi ça sert

Faire tourner plusieurs agents de codage en parallèle, un par issue, et les piloter avec
des touches physiques : débloquer un agent qui attend une validation, passer au workspace
suivant, créer un worktree git, scinder un pane — sans lâcher le clavier ni chercher une
fenêtre de terminal.

Les touches ne se contentent pas d'exécuter, elles **affichent l'état en direct** :

| Touche | Affiche |
|---|---|
| Agents — état | `2⎋ 1▶ 3✓` — bloqués, actifs, prêts |
| Agents — débloquer | `⎋ 2 bloqués` |
| Space — suivant / précédent | le label du workspace focalisé |
| Serveur — état | `Serveur actif` / `Serveur arrêté` |

Rafraîchissement toutes les 3 secondes. Serveur Herdr arrêté : les touches le disent.

## Prérequis

- **macOS 13 ou plus** — ce plugin est mac-only (voir [Limites](#limites))
- [Stream Deck](https://www.elgato.com/downloads) 6.5+
- [Herdr](https://herdr.dev) 0.9.0+, avec `herdr` dans `/opt/homebrew/bin` ou `/usr/local/bin`

## Installation

Téléchargez le `com.dimer47.herdr.streamDeckPlugin` le plus récent depuis les
[Releases](https://github.com/dimer47/streamdeck-herdr/releases) et double-cliquez dessus.
Stream Deck l'installe et une catégorie **Herdr** apparaît dans la liste des actions.

## Les 28 actions

| Famille | Actions |
|---|---|
| **Agents** (6) | état, voir le bloqué, débloquer, valider, relancer, interrompre |
| **Spaces** (4) | précédent, suivant, nouveau, fermer |
| **Worktrees** (2) | créer, retirer |
| **Onglets** (4) | précédent, suivant, nouveau, fermer |
| **Panes** (9) | zoom, scinder à droite, scinder en bas, fermer, focus ×4, copier la sortie |
| **Système** (2) | état du serveur, ouvrir Herdr |
| **Générique** (1) | commande libre |

### Commande libre

Pour tout ce qu'aucune action dédiée ne couvre. Choisissez dans une liste déroulante, ou
tapez une commande Herdr brute dans l'inspecteur — les guillemets sont respectés :

```
agent prompt mon-agent "Continue."
```

### Les fermetures demandent confirmation — ou pas

`Pane — fermer`, `Onglet — fermer`, `Space — fermer` et `Worktree — retirer` portent chacun
une case **Demander avant de fermer**.

Les valeurs par défaut suivent ce que coûte une erreur : panes, onglets et spaces se
ferment immédiatement ; **retirer un worktree demande confirmation**, parce que cela peut
emporter des modifications non commitées.

## Comment les cibles sont résolues

Les identifiants Herdr (`w1`, `w1:p1`) sont attribués à la création — une touche figée sur
l'un d'eux pointe dans le vide le lendemain. Chaque appui résout sa cible au moment du clic :

- **Agents** — d'abord un agent dans l'état voulu (`blocked` pour débloquer, `idle` pour
  relancer), sinon celui du space focalisé, sinon le premier.
- **Spaces / onglets** — rotation circulaire sur la liste triée, autour de l'élément
  focalisé.
- **Panes** — le pane focalisé, via les valeurs par défaut de la CLI.

## Limites

- **macOS uniquement.** Les sélecteurs de dossier, les saisies et les confirmations passent
  par `osascript` ; le presse-papiers par `pbcopy`. Un portage Windows demanderait de
  réécrire ces quatre fonctions — le reste du code est portable.
- **Serveur Herdr local seulement.** Les actions parlent à la socket de la session par
  défaut. Les machines distantes (`herdr --remote`) ne sont pas ciblées.
- **Non notarisé.** Installé via Stream Deck, qui ne l'exige pas.

## Compiler depuis les sources

```bash
git clone https://github.com/dimer47/streamdeck-herdr.git
cd streamdeck-herdr/com.dimer47.herdr.sdPlugin
npm install                      # récupère @elgato/streamdeck dans le bundle

npm install -g @elgato/cli
streamdeck dev                   # mode développeur, requis pour un plugin non signé
streamdeck link  "$PWD"
streamdeck restart com.dimer47.herdr
tail -f logs/com.dimer47.herdr.0.log
```

Produire un paquet :

```bash
streamdeck pack "$PWD" -o ../dist
```

> `node_modules/` n'est **pas** versionné mais **est** embarqué dans le
> `.streamDeckPlugin` : Stream Deck n'exécute jamais `npm install`.
> Sources ≈ 370 Ko, paquet ≈ 5,9 Mo.

## Notes d'implémentation

Deux points ont coûté du temps à découvrir — à connaître avant de forker :

- **Les décorateurs `@action` ne fonctionnent pas sans étape de build.** Ni le Node 20
  embarqué par Stream Deck, ni Node 22 ne les analysent. Ce plugin pose `manifestId` en
  simple propriété de classe, ce que `registerAction()` accepte. Pas de TypeScript, pas de
  rollup, pas de build.
- **Le plugin n'hérite pas du `PATH` du shell.** Le binaire `herdr` est résolu
  explicitement dans `/opt/homebrew/bin` puis `/usr/local/bin`.

Tous les appels à Herdr passent par une fonction qui **ne jette jamais** — une commande en
échec affiche une alerte sur la touche plutôt que de tuer le plugin. Le rafraîchissement
utilise un minuteur par type d'action, arrêté dès qu'aucune touche de ce type n'est visible.

## Localisation

Anglais par défaut, français via `fr.json`. Pour ajouter une langue, copiez `en.json` vers
`<langue>.json` et traduisez `Name` et `Tooltip` pour chaque UUID d'action.

## Licence

MIT — voir [LICENSE](LICENSE).

Herdr est un projet indépendant ; ce plugin n'est affilié ni à ses auteurs, ni à Elgato.
