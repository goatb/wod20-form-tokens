# WoD20 Form Tokens

A small add-on module for the **World of Darkness 20th edition** system (`worldofdarkness`) on **Foundry VTT v12**. It does two things:

1. **Token swap.** When a Werewolf or Changing Breed changes form, the module updates the token image, token size and scale, and optionally the actor portrait, using values you set for each form.
2. **Shape Change rolls change form.** The system's Shape Change roll dialog adds up successes but never changes the form. With this module, once the roll reaches the needed successes, the character changes into the selected form, and the token swap follows.

No system files are modified.

- Foundry VTT: v12 only (verified on 12.331)
- System: `worldofdarkness` 4.2.x (verified against 4.2.12, the last release for v12)

## Install

### On a cloud or hosted server
1. Upload `wod20-form-tokens.zip` with your host's file manager.
2. Extract it into `Data/modules/`, so you get `Data/modules/wod20-form-tokens/module.json`. The folder name must be exactly `wod20-form-tokens`.
3. Restart Foundry, or return to Setup, so it picks up the new module.
4. In your world, open **Game Settings → Manage Modules** and enable **WoD20 Form Tokens**.

If your host only installs from a manifest URL, publish the module first: for example, as a GitHub release with `module.json` and the zip attached. Then add `"manifest"` and `"download"` URLs to `module.json`.

### Local install
Copy the `wod20-form-tokens` folder into `{userData}/Data/modules/`.

## Setup

1. Open a Werewolf or Changing Breed character sheet. The header has a **Form Tokens** button (paw icon), shown to the GM and the actor's owners.
2. The dialog has one row per form the character can take. Changing Breeds show only their own forms, with the breed's names (for example, Corax: Homid / Crinos / Corvid).
   - **Token image** and **Portrait**: pick a file, or leave the field empty to leave that property alone.
   - **W / H**: token size in grid units. **Scale**: texture scale.
   - Greyed-out placeholders are the world defaults. They apply when **Use world default sizes** is ticked and the field is empty.
   - **Capture current**: copies the current token's image, size and scale, plus the actor's portrait, into that row. Fastest setup: put the character in a form, adjust the token by hand, then capture it.
3. **Save**, or **Save & apply current form** to update the tokens right away.

For an **unlinked** token, the config is saved on the base actor, so every unlinked copy of that NPC shares it.

## Settings (world)

| Setting | Default | What it does |
|---|---|---|
| Enable form token swapping | on | Master switch. |
| Change portrait too | on | Also swaps the actor portrait when a form has a portrait set. |
| Shape Change roll changes form | Change automatically | Choices: Nothing (the system's behaviour), Ask first, or Change automatically. |
| Partial successes shift partway | on | Each success moves one form toward the target (Homid → Glabro → Crinos → Hispo → Lupus). Homid → Lupus with 1 success lands in Glabro. Off: successes add up across rolls (the system default). |
| Announce form changes from rolls | on | Posts "X shifts into Crinos" to chat after a successful roll. |
| Default form sizes | Homid 1×1, Glabro 1×1 @ 1.2, Crinos 2×2, Hispo 2×2, Lupus 1×1 | World defaults. Per-actor values override them. |
| Debug logging | off | Writes what the module does to the console (F12). |

## How it works

- **Detecting a form change.** The system stores form state in `system.shapes.<form>.isactive`, with the keys `homid`, `glabro`, `crinos`, `hispo` and `lupus` (Changing Breeds use the same keys). The module reacts to any update that touches `system.shapes`: a sheet form button, a Shape Change roll, a macro or the API. It works out the new form from the flags. It does not use `system.settings.presentform`, because the system stores that value one change behind.
- **Linked actors.** The portrait and prototype-token changes are folded into the same update that changes the form (in `preUpdateActor`). This matters because after every form change, the system's `_onUpdate` sends a second full-actor update from each owner's client. Changing the actor in a separate update could race with that and be reverted. Linked tokens on every scene are then updated, one batch per scene.
- **Unlinked tokens.** Only that token and its synthetic actor's portrait are changed. The base actor's prototype token is left alone.
- **Permissions.** Only the client that made the change applies the swap. Any token that user can't edit is handed to the active GM over a socket. The GM checks that the requesting user owns the actor first. If no GM is online, the player gets a warning.
- **Shape Change roll.** The module re-binds the Roll button in the system's `DialogShapeChange` and runs the system's own roll. Once `numSuccesses >= successesRequired`, it changes into the target form and closes the dialog. With fewer successes (and **Partial successes shift partway** on), it moves one form per success toward the target, then keeps the dialog open with the count reset from the new form, so you can roll again. Changing Breeds that lack a form stop at the furthest form they have (Corax, Homid → Corvid with 1 success: no change; with 2: Crinos). The form change itself works like the sheet: it flips the `isactive` flags and sets `isupdated = false` so the system recalculates.

## Macro API

```js
const api = game.modules.get("wod20-form-tokens").api;
await api.setForm(actor, "crinos");   // change form (as if clicked on the sheet); tokens follow
await api.applyForm(actor);           // re-apply current form's look without changing form
await api.applyForm(actor, "lupus");  // force a form's look (does not change the form)
api.getActiveForm(actor);             // "homid" | "glabro" | "crinos" | "hispo" | "lupus"
api.openConfig(actor);                // open the Form Tokens dialog
```

## Known limitations

- **Form status effects.** The system's `TokenHelper.formShift` (`form_homid`, `form_crinos`, and so on) is disabled in 4.2.12: it returns before doing anything. So no form status effects are applied, with or without this module. The module doesn't add any.
- **Resizing anchors at the top-left.** A token that grows from 1×1 to 2×2 extends down and to the right. It isn't re-centred.
- **Dynamic token rings.** `ring.subject.texture` is replaced only if you had set a separate subject image. Otherwise the ring uses `texture.src`, which the module already changes. `ring.subject.scale` is never changed.
- **Mirroring is kept.** A token flipped horizontally or vertically keeps its flip; only the size of the scale changes.
- **Shape Change roll rules.** Difficulty, needed successes and the success count come from the system's dialog as-is. The module only acts once the dialog's own needed-successes target is reached.
- **No swap animation yet.** Foundry's normal token update animation applies to size changes.
- **v12 only.** Foundry v13 and system 5.x change the sheet and app APIs, so this module would need to be ported.
