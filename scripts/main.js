/**
 * WoD20 Form Tokens — entry point.
 * Foundry VTT v12, worldofdarkness system 4.2.x. Does not modify any system files.
 */
import {
  MODULE_ID, SOCKET, FORM_KEYS, DEFAULT_SIZES,
  getSetting, log, isShifter, getActiveForm, getFormLabel, resolveFormConfig,
  buildActorChanges, predictForm, syncAppearance, setForm, onSocketMessage, shiftDestination,
  hasRage, getTemporaryRage
} from "./core.js";

/** Key on the dialog's data object remembering the "spend Rage" checkbox across re-renders. */
const RAGE_KEY = `${MODULE_ID}SpendRage`;
import { FormTokensConfig, DefaultSizesConfig } from "./apps.js";

/* -------------------------------------------- */
/*  Settings & API                              */
/* -------------------------------------------- */

Hooks.once("init", () => {
  const reg = (key, data) => game.settings.register(MODULE_ID, key, { scope: "world", config: true, ...data });

  reg("enabled", {
    name: "WFT.Settings.Enabled.Name", hint: "WFT.Settings.Enabled.Hint",
    type: Boolean, default: true
  });
  reg("changePortrait", {
    name: "WFT.Settings.ChangePortrait.Name", hint: "WFT.Settings.ChangePortrait.Hint",
    type: Boolean, default: true
  });
  reg("rollChangesForm", {
    name: "WFT.Settings.RollChangesForm.Name", hint: "WFT.Settings.RollChangesForm.Hint",
    type: String, default: "auto",
    choices: {
      off: "WFT.Settings.RollChangesForm.Off",
      ask: "WFT.Settings.RollChangesForm.Ask",
      auto: "WFT.Settings.RollChangesForm.Auto"
    }
  });
  reg("partialShift", {
    name: "WFT.Settings.PartialShift.Name", hint: "WFT.Settings.PartialShift.Hint",
    type: Boolean, default: true
  });
  reg("announceShift", {
    name: "WFT.Settings.Announce.Name", hint: "WFT.Settings.Announce.Hint",
    type: Boolean, default: true
  });
  reg("debug", {
    name: "WFT.Settings.Debug.Name", hint: "WFT.Settings.Debug.Hint",
    type: Boolean, default: false
  });
  game.settings.register(MODULE_ID, "defaultSizes", {
    scope: "world", config: false, type: Object,
    default: foundry.utils.deepClone(DEFAULT_SIZES)
  });
  game.settings.registerMenu(MODULE_ID, "defaultSizesMenu", {
    name: "WFT.Settings.DefaultsMenu.Name",
    label: "WFT.Settings.DefaultsMenu.Label",
    hint: "WFT.Settings.DefaultsMenu.Hint",
    icon: "fas fa-expand-arrows-alt",
    type: DefaultSizesConfig,
    restricted: true
  });

  const mod = game.modules.get(MODULE_ID);
  mod.api = {
    /** Make the actor's tokens/portrait look like `form` (default: its current form). Does not change the form itself. */
    applyForm: (actor, form) => syncAppearance(actor, form ?? getActiveForm(actor)),
    /** Change the character's form (like clicking it on the sheet). Token swap follows automatically. */
    setForm,
    getActiveForm,
    resolveFormConfig,
    openConfig: (actor) => new FormTokensConfig(actor).render(true),
    FORM_KEYS
  };
});

Hooks.once("ready", () => {
  game.socket.on(SOCKET, (data) => onSocketMessage(data).catch((err) => console.error(`${MODULE_ID} |`, err)));
  if (game.system.id !== "worldofdarkness") {
    console.warn(`${MODULE_ID} | active system is "${game.system.id}", not worldofdarkness; module idle.`);
  }
  log("ready");
});

const enabled = () => game.system.id === "worldofdarkness" && getSetting("enabled");

/* -------------------------------------------- */
/*  Form change detection                       */
/* -------------------------------------------- */

/**
 * Linked actors: fold the portrait + prototype-token changes into the SAME update that flips
 * the form. The system's _onUpdate then runs a follow-up full-actor update from every owner's
 * client; doing our actor-level changes atomically means that follow-up can't revert them.
 * preUpdate hooks only run on the client making the change, so this runs once.
 */
Hooks.on("preUpdateActor", (actor, changes, options, userId) => {
  if (!enabled() || options?.[MODULE_ID]?.sync) return;
  if (!isShifter(actor) || actor.isToken) return;
  if (!foundry.utils.hasProperty(changes, "system.shapes")) return;

  const form = predictForm(actor, changes);
  if (!form || form === getActiveForm(actor)) return;

  const extra = buildActorChanges(actor, resolveFormConfig(actor, form));
  if (foundry.utils.isEmpty(extra)) return;
  log(`preUpdate ${actor.name}: ${getActiveForm(actor)} -> ${form}`, extra);
  foundry.utils.mergeObject(changes, foundry.utils.expandObject(extra));
});

/** Coalesce triggers per actor (updateActor and updateToken can both fire for unlinked tokens). */
const pending = new Map();
function scheduleSync(actor) {
  const key = actor.uuid;
  clearTimeout(pending.get(key));
  pending.set(key, setTimeout(() => {
    pending.delete(key);
    const current = fromUuidSync(key) ?? actor;
    syncAppearance(current).catch((err) => {
      console.error(`${MODULE_ID} | sync failed`, err);
      ui.notifications.warn(game.i18n.localize("WFT.Warn.ApplyFailed"));
    });
  }, 50));
}

/** Scene tokens (and unlinked token appearance) are updated after the form change lands. */
Hooks.on("updateActor", (actor, changes, options, userId) => {
  if (userId !== game.user.id || !enabled() || options?.[MODULE_ID]?.sync) return;
  if (!isShifter(actor)) return;
  if (!foundry.utils.hasProperty(changes, "system.shapes")) return;
  log(`updateActor ${actor.name}: now ${getActiveForm(actor)}`, changes.system.shapes);
  scheduleSync(actor);
});

/** Unlinked tokens: synthetic-actor changes arrive as token delta updates. */
Hooks.on("updateToken", (tokenDoc, changes, options, userId) => {
  if (userId !== game.user.id || !enabled() || options?.[MODULE_ID]?.sync) return;
  if (tokenDoc.actorLink) return;
  if (!foundry.utils.hasProperty(changes, "delta.system.shapes")) return;
  const actor = tokenDoc.actor;
  if (!isShifter(actor)) return;
  log(`updateToken ${tokenDoc.name}: delta shapes changed`);
  scheduleSync(actor);
});

/* -------------------------------------------- */
/*  Sheet header button                         */
/* -------------------------------------------- */

Hooks.on("getActorSheetHeaderButtons", (app, buttons) => {
  if (game.system.id !== "worldofdarkness") return;
  const actor = app.actor ?? app.document;
  if (!isShifter(actor) || !actor.isOwner) return;
  buttons.unshift({
    label: game.i18n.localize("WFT.HeaderButton"),
    class: "wft-open-config",
    icon: "fas fa-paw",
    onclick: () => new FormTokensConfig(actor).render(true)
  });
});

/* -------------------------------------------- */
/*  Shape Change roll -> actually change form   */
/* -------------------------------------------- */

/**
 * The system's DialogShapeChange (module/dialogs/dialog-shapechange.js) accumulates successes
 * toward `object.successesRequired` but never changes system.shapes. We re-bind its Roll button
 * to run the original roll and then change form once the needed successes are reached.
 */
Hooks.on("renderDialogShapeChange", (app, html) => {
  if (!enabled() || getSetting("rollChangesForm") === "off") return;
  if (typeof app._shiftform !== "function") return;
  const $html = html instanceof jQuery ? html : $(html);
  const button = $html.find(".actionbutton");
  if (!button.length) return;

  injectRageOption(app, $html);

  button.off("click").on("click", async (event) => {
    if (app.object?.[RAGE_KEY] && hasRage(app.actor)) {
      event.preventDefault(); // no form submit / re-render: we close the dialog ourselves
      try {
        await rageShift(app);
      } catch (err) {
        console.error(`${MODULE_ID} | rage shift failed`, err);
      }
      return;
    }
    await app._shiftform(event);
    try {
      await completeShapeChange(app);
    } catch (err) {
      console.error(`${MODULE_ID} | shape change failed`, err);
    }
  });
});

/** Add a "Spend 1 Rage to shift instantly" checkbox above the dialog's Roll/Close buttons. */
function injectRageOption(app, $html) {
  const actor = app.actor;
  if (!hasRage(actor) || !app.object) return;
  const rage = getTemporaryRage(actor);
  const checked = app.object[RAGE_KEY] ? "checked" : "";
  const label = game.i18n.format("WFT.Rage.Checkbox", { rage });
  const area = $(`
    <div class="dialog-area wft-rage-area">
      <label class="wft-rage">
        <input type="checkbox" class="wft-spend-rage" ${checked} ${rage < 1 ? "disabled" : ""} />
        ${label}
      </label>
    </div>`);

  // Keep the state on the dialog's object and don't let the system's submit-on-change re-render.
  area.find("input").on("change", (ev) => {
    ev.stopPropagation();
    app.object[RAGE_KEY] = ev.currentTarget.checked;
  });
  if (rage < 1) app.object[RAGE_KEY] = false;

  const buttons = $html.find(".actionbutton").closest("div");
  if (buttons.length) buttons.before(area);
  else $html.find("form").append(area);
  try { app.setPosition({ height: "auto" }); } catch (e) { /* not positioned yet */ }
}

/** Spend 1 temporary Rage and change straight into the selected form, no roll. */
async function rageShift(app) {
  const actor = app.actor;
  const target = app.object?.selectedShape;
  if (!isShifter(actor)) return;
  if (!FORM_KEYS.includes(target)) {
    ui.notifications.warn(game.i18n.localize("WFT.Rage.NoTarget"));
    return;
  }
  if (getActiveForm(actor) === target) {
    ui.notifications.warn(game.i18n.localize("WFT.Rage.SameForm"));
    return;
  }
  const rage = getTemporaryRage(actor);
  if (rage < 1) {
    ui.notifications.warn(game.i18n.localize("WFT.Rage.NotEnough"));
    return;
  }
  if (app[`_${MODULE_ID}Busy`]) return;

  app[`_${MODULE_ID}Busy`] = true;
  try {
    log(`rage shift: ${actor.name} -> ${target} (rage ${rage} -> ${rage - 1})`);
    const changed = await setForm(actor, target, { "system.advantages.rage.temporary": rage - 1 });
    if (!changed) return;
    if (getSetting("announceShift")) {
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<p>${game.i18n.format("WFT.Rage.Announce", {
          name: actor.name, form: getFormLabel(actor, target), rage: rage - 1
        })}</p>`
      });
    }
    app.close();
  } finally {
    app[`_${MODULE_ID}Busy`] = false;
  }
}

async function completeShapeChange(app) {
  const actor = app.actor;
  const o = app.object ?? {};
  const target = o.selectedShape;
  if (!isShifter(actor) || !FORM_KEYS.includes(target)) return;
  if (app[`_${MODULE_ID}Busy`]) return;
  if (!(Number(o.successesRequired) > 0)) return;

  const got = Number(o.numSuccesses) || 0;
  const need = Number(o.successesRequired);
  const dest = shiftDestination(actor, target, got, need, { partial: getSetting("partialShift") });
  if (!dest) return;

  app[`_${MODULE_ID}Busy`] = true;
  try {
    const formLabel = getFormLabel(actor, dest.form);
    const targetLabel = getFormLabel(actor, target);
    const fmt = { name: actor.name, form: formLabel, target: targetLabel, got, need };

    if (getSetting("rollChangesForm") === "ask") {
      const ok = await Dialog.confirm({
        title: game.i18n.localize("WFT.Roll.ConfirmTitle"),
        content: game.i18n.format(dest.full ? "WFT.Roll.ConfirmContent" : "WFT.Roll.ConfirmPartial", fmt)
      });
      if (!ok) return;
    }

    log(`shape change roll: ${actor.name} -> ${dest.form} (${got}/${need}, full=${dest.full})`);
    const changed = await setForm(actor, dest.form);
    if (!changed) return;

    if (getSetting("announceShift")) {
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<p>${game.i18n.format(dest.full ? "WFT.Roll.Announce" : "WFT.Roll.AnnouncePartial", fmt)}</p>`
      });
    }

    if (dest.full) {
      app.close();
      return;
    }

    // Partial: the character is now in a new form, so restart the count from there.
    o.numSuccesses = 0;
    o.close = false;
    o.successesRequired = typeof app._calculateSuccessesRequired === "function"
      ? await app._calculateSuccessesRequired()
      : Math.abs(FORM_KEYS.indexOf(target) - FORM_KEYS.indexOf(dest.form));
    app.render();
  } finally {
    app[`_${MODULE_ID}Busy`] = false;
  }
}
