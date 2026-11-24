/**
 * Core logic: form detection, config resolution, and applying token/portrait changes.
 * Targets Foundry VTT v12 and the worldofdarkness system 4.2.x.
 */

export const MODULE_ID = "wod20-form-tokens";
export const SOCKET = `module.${MODULE_ID}`;
export const FORM_KEYS = ["homid", "glabro", "crinos", "hispo", "lupus"];

/** Suggested starting defaults for a 5 ft grid. */
export const DEFAULT_SIZES = {
  homid:  { width: 1, height: 1, scale: 1 },
  glabro: { width: 1, height: 1, scale: 1.2 },
  crinos: { width: 2, height: 2, scale: 1 },
  hispo:  { width: 2, height: 2, scale: 1 },
  lupus:  { width: 1, height: 1, scale: 1 }
};

/**
 * Which of the five shape slots each Changing Breed uses, and the label the system shows for it.
 * Taken from systems/worldofdarkness/templates/dialogs/dialog-shapechange.hbs (v4.2.12).
 */
const STD = (k) => `wod.shapes.${k}`;
export const BREED_FORMS = {
  Ajaba:    { homid: STD("homid"), glabro: STD("anthros"), crinos: STD("crinos"), hispo: STD("crocas"), lupus: STD("hyaenid") },
  Ananasi:  { homid: STD("homid"), glabro: STD("lilian"), hispo: STD("pithus"), lupus: STD("crawlerling") },
  Bastet:   { homid: STD("homid"), glabro: STD("sokto"), crinos: STD("crinos"), hispo: STD("chatro"), lupus: STD("feline") },
  Corax:    { homid: STD("homid"), crinos: STD("crinos"), lupus: STD("corvid") },
  Gurahl:   { homid: STD("homid"), glabro: STD("arthren"), crinos: STD("crinos"), hispo: STD("bjornen"), lupus: STD("ursus") },
  Kitsune:  { homid: STD("hitogata"), glabro: STD("sambuhenge"), crinos: STD("koto"), hispo: STD("juko"), lupus: STD("kyubi") },
  Mokole:   { homid: STD("homid"), crinos: STD("archid"), lupus: STD("suchid") },
  Nagah:    { homid: STD("balaram"), glabro: STD("silkaram"), crinos: STD("azhidahaka"), hispo: STD("kalidahaka"), lupus: STD("vasuki") },
  Nuwisha:  { homid: STD("homid"), glabro: STD("tsitsu"), crinos: STD("manabozho"), hispo: STD("sendeh"), lupus: STD("latrani") },
  Ratkin:   { homid: STD("homid"), crinos: STD("crinos"), lupus: STD("rodens") },
  Rokea:    { homid: STD("homid"), glabro: STD("glabrus"), crinos: STD("gladius"), hispo: STD("chasmus"), lupus: STD("squamus") },
  Apis:     { homid: STD("homid"), crinos: STD("crinos"), lupus: STD("lupus") },
  Camazotz: { homid: STD("homid"), glabro: STD("glabro"), crinos: STD("crinos"), lupus: STD("lupus") },
  Grondr:   { homid: STD("homid"), glabro: STD("glabro"), crinos: STD("crinos"), hispo: STD("hispo"), lupus: STD("lupus") }
};

/* -------------------------------------------- */
/*  Small helpers                               */
/* -------------------------------------------- */

export function getSetting(key) {
  return game.settings.get(MODULE_ID, key);
}

export function log(...args) {
  try {
    if (getSetting("debug")) console.log(`${MODULE_ID} |`, ...args);
  } catch (e) { /* settings not registered yet */ }
}

const isSet = (v) => v !== null && v !== undefined && v !== "";

function toPositiveNumber(v) {
  if (!isSet(v)) return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function toPath(v) {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

const nearlyEqual = (a, b) => Math.abs((a ?? 0) - (b ?? 0)) < 1e-6;

/* -------------------------------------------- */
/*  Actor / form helpers                        */
/* -------------------------------------------- */

function shifterTypes() {
  const t = CONFIG.worldofdarkness?.sheettype ?? {};
  return [t.werewolf ?? "Werewolf", t.changingbreed ?? "Changing Breed"];
}

export function isShifter(actor) {
  return !!actor && shifterTypes().includes(actor.type) && !!actor.system?.shapes;
}

export function isWerewolf(actor) {
  return actor?.type === (CONFIG.worldofdarkness?.sheettype?.werewolf ?? "Werewolf");
}

/** The key of the currently active form, from system.shapes.<form>.isactive. */
export function getActiveForm(actor) {
  const shapes = actor?.system?.shapes;
  if (!shapes) return null;
  return FORM_KEYS.find((k) => shapes[k]?.isactive) ?? null;
}

/** Forms this actor can take, as [{key, label}] with label being an i18n key. */
export function getAvailableForms(actor) {
  if (!isWerewolf(actor)) {
    const breed = BREED_FORMS[actor?.system?.changingbreed];
    if (breed) return Object.entries(breed).map(([key, label]) => ({ key, label }));
  }
  return FORM_KEYS.map((key) => ({ key, label: actor?.system?.shapes?.[key]?.label ?? STD(key) }));
}

export function getFormLabel(actor, form) {
  const entry = getAvailableForms(actor).find((f) => f.key === form);
  return game.i18n.localize(entry?.label ?? STD(form));
}

/**
 * The actor whose flags hold the config. For an unlinked token we store config on the
 * base (world) actor so every unlinked copy shares it. Reading a synthetic actor's flags
 * falls through to the base actor anyway.
 */
export function getConfigActor(actor) {
  if (actor?.isToken) {
    const base = actor.token?.baseActor ?? game.actors.get(actor.id);
    if (base?.isOwner) return base;
  }
  return actor;
}

/* -------------------------------------------- */
/*  Config resolution                           */
/* -------------------------------------------- */

/**
 * Resolve the effective config for one form: per-actor value, else world default (sizes only),
 * else null meaning "leave alone".
 */
export function resolveFormConfig(actor, form) {
  const per = actor.getFlag(MODULE_ID, `forms.${form}`) ?? {};
  const useDefaults = actor.getFlag(MODULE_ID, "useDefaults") ?? true;
  const defs = useDefaults ? (getSetting("defaultSizes")?.[form] ?? {}) : {};
  const pick = (k) => toPositiveNumber(isSet(per[k]) ? per[k] : defs[k]);
  return {
    tokenImg: toPath(per.tokenImg),
    portraitImg: toPath(per.portraitImg),
    width: pick("width"),
    height: pick("height"),
    scale: pick("scale")
  };
}

/**
 * Flattened changes for a TokenDocument or PrototypeToken, skipping values that already match.
 * Keeps the sign of texture scale so mirrored tokens stay mirrored.
 */
export function buildTokenChanges(token, cfg) {
  const changes = {};
  const tex = token.texture ?? {};

  if (cfg.tokenImg && tex.src !== cfg.tokenImg) changes["texture.src"] = cfg.tokenImg;

  // Dynamic token rings (v12): the subject image falls back to texture.src when ring.subject.texture
  // is empty. Only overwrite ring.subject.texture when the user has set a separate subject image.
  const ring = token.ring;
  if (cfg.tokenImg && ring?.enabled && ring.subject?.texture && ring.subject.texture !== cfg.tokenImg) {
    changes["ring.subject.texture"] = cfg.tokenImg;
  }

  if (cfg.width && !nearlyEqual(token.width, cfg.width)) changes.width = cfg.width;
  if (cfg.height && !nearlyEqual(token.height, cfg.height)) changes.height = cfg.height;

  if (cfg.scale) {
    const sx = (Math.sign(tex.scaleX ?? 1) || 1) * cfg.scale;
    const sy = (Math.sign(tex.scaleY ?? 1) || 1) * cfg.scale;
    if (!nearlyEqual(tex.scaleX, sx)) changes["texture.scaleX"] = sx;
    if (!nearlyEqual(tex.scaleY, sy)) changes["texture.scaleY"] = sy;
  }
  return changes;
}

/** Flattened actor-level changes: portrait and prototype token. */
export function buildActorChanges(actor, cfg) {
  const changes = {};
  if (getSetting("changePortrait") && cfg.portraitImg && actor.img !== cfg.portraitImg) {
    changes.img = cfg.portraitImg;
  }
  for (const [k, v] of Object.entries(buildTokenChanges(actor.prototypeToken, cfg))) {
    changes[`prototypeToken.${k}`] = v;
  }
  return changes;
}

/**
 * Work out everything that needs to change for `actor` to look like `form`.
 * Linked actor: actor img + prototype token + every linked token on every scene.
 * Unlinked (synthetic) actor: synthetic img + that one token only.
 */
export function buildPlan(actor, form) {
  const cfg = resolveFormConfig(actor, form);
  const plan = { actor, form, cfg, actorChanges: {}, tokens: new Map() };

  if (actor.isToken) {
    const td = actor.token;
    if (getSetting("changePortrait") && cfg.portraitImg && actor.img !== cfg.portraitImg) {
      plan.actorChanges.img = cfg.portraitImg;
    }
    const ch = td ? buildTokenChanges(td, cfg) : {};
    if (td?.parent && !foundry.utils.isEmpty(ch)) plan.tokens.set(td.parent.id, [{ _id: td.id, ...ch }]);
    return plan;
  }

  plan.actorChanges = buildActorChanges(actor, cfg);
  for (const scene of game.scenes) {
    const updates = [];
    for (const td of scene.tokens) {
      if (!td.actorLink || td.actorId !== actor.id) continue;
      const ch = buildTokenChanges(td, cfg);
      if (!foundry.utils.isEmpty(ch)) updates.push({ _id: td.id, ...ch });
    }
    if (updates.length) plan.tokens.set(scene.id, updates);
  }
  return plan;
}

/**
 * Apply as much of the plan as this user is allowed to. Returns true if something was skipped
 * for lack of permission (or failed), so the caller can ask a GM.
 */
export async function executePlan(plan) {
  let blocked = false;
  const opts = { [MODULE_ID]: { sync: true } };

  if (!foundry.utils.isEmpty(plan.actorChanges)) {
    if (plan.actor.canUserModify(game.user, "update")) {
      try {
        await plan.actor.update(plan.actorChanges, opts);
      } catch (err) {
        console.error(`${MODULE_ID} | actor update failed`, err);
        blocked = true;
      }
    } else blocked = true;
  }

  for (const [sceneId, updates] of plan.tokens) {
    const scene = game.scenes.get(sceneId);
    if (!scene) continue;
    const mine = updates.filter((u) => scene.tokens.get(u._id)?.canUserModify(game.user, "update"));
    if (mine.length < updates.length) blocked = true;
    if (!mine.length) continue;
    try {
      await scene.updateEmbeddedDocuments("Token", mine, opts);
    } catch (err) {
      console.error(`${MODULE_ID} | token update failed on scene ${scene.name}`, err);
      blocked = true;
    }
  }
  return blocked;
}

/**
 * Make the actor's tokens/portrait match `form` (defaults to the active form).
 * Falls back to the active GM through the socket for anything this user can't edit.
 */
export async function syncAppearance(actor, form = getActiveForm(actor)) {
  if (!actor || !form) return;
  const plan = buildPlan(actor, form);
  log(`sync ${actor.name} -> ${form}`, plan);
  const blocked = await executePlan(plan);
  if (!blocked) return;

  if (game.user.isGM) {
    ui.notifications.warn(game.i18n.localize("WFT.Warn.ApplyFailed"));
    return;
  }
  if (!game.users.activeGM) {
    ui.notifications.warn(game.i18n.localize("WFT.Warn.NoGM"));
    return;
  }
  log(`asking GM to finish sync for ${actor.name}`);
  game.socket.emit(SOCKET, { action: "sync", actorUuid: actor.uuid, form, userId: game.user.id });
}

/** GM side of the socket fallback. Only the active GM acts, and only for owners of the actor. */
export async function onSocketMessage(data) {
  if (data?.action !== "sync") return;
  if (!game.user.isGM || game.users.activeGM?.id !== game.user.id) return;
  if (!FORM_KEYS.includes(data.form)) return;
  const actor = await fromUuid(data.actorUuid);
  const user = game.users.get(data.userId);
  if (!actor || !user || !isShifter(actor) || !actor.testUserPermission(user, "OWNER")) return;
  log(`GM finishing sync for ${actor.name} (requested by ${user.name})`);
  await executePlan(buildPlan(actor, data.form));
}

/**
 * Actually change the character's form, the same way the system's sheet does:
 * flip the isactive flags and set isupdated=false so the system recalculates.
 * The updateActor hook then swaps the token appearance.
 */
export async function setForm(actor, form) {
  if (!isShifter(actor) || !FORM_KEYS.includes(form)) return false;
  if (!actor.system.shapes?.[form]) return false;
  const update = { "system.settings.isupdated": false };
  for (const k of FORM_KEYS) {
    if (actor.system.shapes[k]) update[`system.shapes.${k}.isactive`] = k === form;
  }
  const label = actor.system.shapes[form].label;
  if (label) update["system.settings.presentform"] = label;
  await actor.update(update);
  return true;
}

/**
 * Where a Shape Change roll lands. Forms are ordered homid → glabro → crinos → hispo → lupus and
 * each success moves one step toward the target (this matches how the system counts
 * successesRequired). With fewer successes than needed and `partial` on, the character stops
 * partway. For Changing Breeds that lack a slot (e.g. Corax has no glabro), it stops at the
 * furthest form it actually has without passing the reached step.
 * Returns { form, full } or null when the form doesn't change.
 */
export function shiftDestination(actor, target, successes, required, { partial = true } = {}) {
  const current = getActiveForm(actor);
  const ci = FORM_KEYS.indexOf(current);
  const ti = FORM_KEYS.indexOf(target);
  if (ci < 0 || ti < 0 || ci === ti) return null;
  const got = Math.max(0, Math.floor(Number(successes) || 0));
  const need = Number(required) > 0 ? Number(required) : Math.abs(ti - ci);

  if (got >= need) return { form: target, full: true };
  if (!partial || got === 0) return null;

  const dir = Math.sign(ti - ci);
  const reached = ci + dir * Math.min(got, Math.abs(ti - ci));
  const available = new Set(getAvailableForms(actor).map((f) => f.key));
  for (let i = reached; i !== ci; i -= dir) {
    if (available.has(FORM_KEYS[i]) && actor.system?.shapes?.[FORM_KEYS[i]]) {
      return { form: FORM_KEYS[i], full: false };
    }
  }
  return null;
}

/** Predict the active form after `changes` are applied (used in preUpdateActor). */
export function predictForm(actor, changes) {
  for (const k of FORM_KEYS) {
    const changed = foundry.utils.getProperty(changes, `system.shapes.${k}.isactive`);
    const active = changed !== undefined ? changed : actor.system?.shapes?.[k]?.isactive;
    if (active) return k;
  }
  return null;
}
