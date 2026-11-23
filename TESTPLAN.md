# Manual test plan

**Setup.** Foundry v12 with system `worldofdarkness` 4.2.12 and the module enabled. Turn on **Debug logging** and keep the console (F12) open.

**Test assets.** Use two clearly different token images, such as `homid.webp` and `crinos.webp`, and one portrait for Crinos.

| # | Case | Steps | Expected |
|---|---|---|---|
| 1 | Header button | As GM, open a Werewolf sheet. Then open a Vampire sheet. | The Werewolf sheet has a **Form Tokens** button. The Vampire sheet has none. |
| 2 | Configure and capture | Open Form Tokens and set a Crinos token image and portrait. On a Homid token, click **Capture current** on the Homid row, then Save. | The Homid row fills in from the token. After reopening, all values are still there. |
| 3 | Linked PC on two scenes | Place the same linked PC on scenes A and B. On the sheet, click Crinos. | The tokens on **both** scenes switch to the Crinos image at 2×2. The prototype token (Configure Prototype Token) matches. The portrait changes. |
| 4 | Switch back | Click Homid. | The tokens return to the Homid image at 1×1, scale 1. The portrait returns only if the Homid row has a portrait set. |
| 5 | Follow-up update doesn't revert | Repeat 3 with both the GM and the owning player logged in. Wait 2 seconds. | The portrait and prototype token stay on Crinos. They don't flip back when the system's recalculation update runs. |
| 6 | Unlinked NPC werewolf | Place two unlinked tokens of one NPC Werewolf. Open **one token's** sheet and click Crinos. | Only that token changes. The other token and the base actor's prototype token stay the same. |
| 7 | Player switches forms | As a player who owns the PC, click Crinos on the sheet. | The tokens update with no permission errors in the console. |
| 8 | Player without token rights (GM fallback) | Put the player's linked PC on a scene and set that token's ownership so the player can't edit it. As the player, switch forms with the GM online, then again with the GM offline. | GM online: the GM updates the token, and the console shows "GM finishing sync". GM offline: the player sees a warning. |
| 9 | Empty config for one form | Clear every field in the Hispo row, untick **Use world default sizes**, Save, then switch to Hispo. | Nothing about the token or portrait changes. |
| 10 | World defaults only | On a fresh Werewolf with no config, switch to Crinos. | The token becomes 2×2 and the image is unchanged. Glabro gives scale 1.2. |
| 11 | Shape Change roll, auto | Open the sheet's Shape Change roll and pick Crinos from Homid (2 successes needed). Roll until the total reaches 2. | The dialog closes, the sheet shows Crinos, the tokens swap, and chat says "… shifts into Crinos". |
| 12 | Shape Change roll, not enough | Roll and get fewer successes than needed. | The form doesn't change and the dialog stays open, as before. |
| 13 | Shape Change roll, ask / off | Set the setting to **Ask** and repeat 11, then set it to **Off** and repeat 11. | Ask: a confirm dialog appears, and No keeps the current form. Off: the system's original behaviour, with no form change. |
| 14 | Changing Breed | Make a Changing Breed with breed Corax and open Form Tokens. Then switch forms on the sheet. | The dialog shows only Homid, Crinos and Corvid. The tokens swap. |
| 15 | System form effects | Switch forms on a Werewolf token. | No `form_*` status effects appear (the system has these disabled in 4.2.12) and there are no console errors. |
| 16 | Mirrored token | Mirror a token horizontally, then switch to Glabro. | The token stays mirrored, at scale 1.2. |
| 17 | Disable switch | Turn off **Enable form token swapping** and switch forms. | Tokens don't change. The roll dialog behaves as the system's original. |
| 18 | API | `game.modules.get("wod20-form-tokens").api.setForm(actor, "lupus")` | The form becomes Lupus and the tokens swap. |
