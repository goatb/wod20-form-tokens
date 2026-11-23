/**
 * V1 FormApplications (safe on Foundry v12): per-actor form config and world default sizes.
 */
import {
  MODULE_ID, FORM_KEYS, DEFAULT_SIZES,
  getSetting, getActiveForm, getAvailableForms, getConfigActor, syncAppearance
} from "./core.js";

const numOrNull = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};
const strOrEmpty = (v) => (typeof v === "string" ? v.trim() : "");

/* -------------------------------------------- */
/*  Per-actor form config                       */
/* -------------------------------------------- */

export class FormTokensConfig extends FormApplication {
  constructor(actor, options = {}) {
    super(actor, { id: `${MODULE_ID}-config-${actor.uuid.replaceAll(".", "-")}`, ...options });
    this.actor = actor;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["wft-config"],
      template: `modules/${MODULE_ID}/templates/form-config.hbs`,
      width: 820,
      height: "auto",
      closeOnSubmit: true,
      submitOnChange: false,
      resizable: true
    });
  }

  get title() {
    return `${game.i18n.localize("WFT.ConfigTitle")}: ${this.actor.name}`;
  }

  /** Where config is read from and written to. */
  get configActor() {
    return getConfigActor(this.actor);
  }

  getData() {
    const target = this.configActor;
    const stored = target.getFlag(MODULE_ID, "forms") ?? {};
    const defaults = getSetting("defaultSizes") ?? {};
    const active = getActiveForm(this.actor);
    const useDefaults = target.getFlag(MODULE_ID, "useDefaults") ?? true;

    const forms = getAvailableForms(this.actor).map(({ key, label }) => {
      const s = stored[key] ?? {};
      const d = defaults[key] ?? {};
      return {
        key,
        label: game.i18n.localize(label),
        isCurrent: key === active,
        tokenImg: s.tokenImg ?? "",
        portraitImg: s.portraitImg ?? "",
        width: s.width ?? "",
        height: s.height ?? "",
        scale: s.scale ?? "",
        phWidth: useDefaults ? (d.width ?? "") : "",
        phHeight: useDefaults ? (d.height ?? "") : "",
        phScale: useDefaults ? (d.scale ?? "") : ""
      };
    });

    return {
      forms,
      useDefaults,
      sharedNote: this.actor.isToken && target !== this.actor
        ? game.i18n.format("WFT.ConfigTarget", { name: target.name })
        : null
    };
  }

  activateListeners(html) {
    super.activateListeners(html); // wires up button.file-picker
    html.find("button.wft-capture").on("click", this._onCapture.bind(this));
    html.find("button.wft-apply").on("click", this._onApplyNow.bind(this));
    html.find("input.wft-img").on("change input", (ev) => this._refreshPreview(ev.currentTarget));
  }

  _refreshPreview(input) {
    const img = input.closest("td")?.querySelector("img.wft-preview");
    if (!img) return;
    const v = input.value.trim();
    img.src = v;
    img.classList.toggle("wft-empty", !v);
  }

  /** Pick the token to capture from: this synthetic token, a controlled token, an active token, or the prototype. */
  _captureSource() {
    const a = this.actor;
    if (a.isToken && a.token) return { token: a.token, scene: a.token.parent };
    const controlled = canvas?.tokens?.controlled?.find((t) => t.actor?.id === a.id)?.document;
    if (controlled) return { token: controlled, scene: controlled.parent };
    const active = a.getActiveTokens(false, true)?.[0];
    if (active) return { token: active, scene: active.parent };
    return { token: a.prototypeToken, scene: null };
  }

  _onCapture(event) {
    event.preventDefault();
    const form = event.currentTarget.dataset.form;
    const { token, scene } = this._captureSource();
    const root = this.element[0];
    const set = (field, value) => {
      const input = root.querySelector(`[name="forms.${form}.${field}"]`);
      if (!input) return;
      input.value = value ?? "";
      if (input.classList.contains("wft-img")) this._refreshPreview(input);
    };
    set("tokenImg", token.texture?.src);
    set("width", token.width);
    set("height", token.height);
    set("scale", Math.abs(token.texture?.scaleX ?? 1));
    set("portraitImg", this.actor.img);

    const source = scene
      ? game.i18n.format("WFT.SourceToken", { scene: scene.name })
      : game.i18n.localize("WFT.SourcePrototype");
    ui.notifications.info(game.i18n.format("WFT.Captured", { source }));
  }

  async _onApplyNow(event) {
    event.preventDefault();
    await this.submit({ preventClose: true });
    await syncAppearance(this.actor);
    this.close();
  }

  async _updateObject(event, formData) {
    const data = foundry.utils.expandObject(formData);
    const forms = {};
    for (const key of FORM_KEYS) {
      const row = data.forms?.[key];
      if (!row) continue; // form not shown for this breed: leave stored values alone
      forms[key] = {
        tokenImg: strOrEmpty(row.tokenImg),
        portraitImg: strOrEmpty(row.portraitImg),
        width: numOrNull(row.width),
        height: numOrNull(row.height),
        scale: numOrNull(row.scale)
      };
    }
    await this.configActor.update({
      [`flags.${MODULE_ID}.forms`]: forms,
      [`flags.${MODULE_ID}.useDefaults`]: !!data.useDefaults
    });
  }
}

/* -------------------------------------------- */
/*  World default sizes                         */
/* -------------------------------------------- */

export class DefaultSizesConfig extends FormApplication {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: `${MODULE_ID}-defaults`,
      classes: ["wft-defaults"],
      title: game.i18n.localize("WFT.Defaults.Title"),
      template: `modules/${MODULE_ID}/templates/default-sizes.hbs`,
      width: 420,
      height: "auto",
      closeOnSubmit: true
    });
  }

  getData() {
    const current = getSetting("defaultSizes") ?? {};
    return {
      forms: FORM_KEYS.map((key) => ({
        key,
        label: game.i18n.localize(`wod.shapes.${key}`),
        width: current[key]?.width ?? "",
        height: current[key]?.height ?? "",
        scale: current[key]?.scale ?? ""
      }))
    };
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.find("button.wft-reset").on("click", async (ev) => {
      ev.preventDefault();
      await game.settings.set(MODULE_ID, "defaultSizes", foundry.utils.deepClone(DEFAULT_SIZES));
      this.render();
    });
  }

  async _updateObject(event, formData) {
    const data = foundry.utils.expandObject(formData);
    const out = {};
    for (const key of FORM_KEYS) {
      const row = data.forms?.[key] ?? {};
      out[key] = { width: numOrNull(row.width), height: numOrNull(row.height), scale: numOrNull(row.scale) };
    }
    await game.settings.set(MODULE_ID, "defaultSizes", out);
  }
}
