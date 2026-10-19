const MODULE_ID = "actor-list-cr";

const SORT_SETTING = "sortByCR";

Hooks.once("init", () => {
  // Per-user toggle for sorting the Actor Directory by CR.
  game.settings.register(MODULE_ID, SORT_SETTING, {
    scope: "client",
    config: false,
    type: Boolean,
    default: false
  });

  console.log("Actor List CR Badges | Module initialized.");
});

Hooks.once("ready", () => {
  console.log("Actor List CR Badges | Module ready.");
  ui.notifications.info("Actor List CR Badges module is active.");

  // Try to refresh the actor directory shortly after the world loads.
  setTimeout(() => {
    refreshActorDirectory();
  }, 500);
});

/**
 * Convert Foundry/jQuery-ish HTML into a normal HTMLElement.
 */
function getHtmlElement(html) {
  if (html instanceof HTMLElement) return html;
  if (html?.[0] instanceof HTMLElement) return html[0];
  if (html?.element instanceof HTMLElement) return html.element;
  return null;
}

/**
 * Turn CR decimals into normal D&D-looking fractions.
 */
function formatCR(rawCR) {
  if (rawCR === undefined || rawCR === null || rawCR === "") return null;

  // Some systems/versions may store CR as an object.
  if (typeof rawCR === "object") {
    rawCR = rawCR.value ?? rawCR.cr ?? rawCR.number ?? null;
  }

  if (rawCR === undefined || rawCR === null || rawCR === "") return null;

  const numberCR = Number(rawCR);

  if (!Number.isNaN(numberCR)) {
    if (Math.abs(numberCR - 0.125) < 0.001) return "1/8";
    if (Math.abs(numberCR - 0.25) < 0.001) return "1/4";
    if (Math.abs(numberCR - 0.5) < 0.001) return "1/2";
    return String(numberCR);
  }

  return String(rawCR);
}

/**
 * Get the raw D&D5e challenge rating from an Actor.
 */
function getRawActorCR(actor) {
  if (!actor) return null;

  // In D&D5e, monsters/creatures are normally NPC actors.
  if (actor.type !== "npc") return null;

  return (
    foundry.utils.getProperty(actor, "system.details.cr") ??
    foundry.utils.getProperty(actor, "system.details.cr.value")
  );
}

/**
 * Get the D&D5e challenge rating from an Actor, formatted for display.
 */
function getActorCR(actor) {
  return formatCR(getRawActorCR(actor));
}

/**
 * Get the challenge rating from an Actor as a number for sorting.
 * Returns null if the actor has no usable CR.
 */
function getActorCRValue(actor) {
  let rawCR = getRawActorCR(actor);

  if (rawCR !== null && typeof rawCR === "object") {
    rawCR = rawCR.value ?? rawCR.cr ?? rawCR.number ?? null;
  }

  if (rawCR === undefined || rawCR === null || rawCR === "") return null;

  // Handle fraction strings such as "1/4".
  if (typeof rawCR === "string" && rawCR.includes("/")) {
    const [numerator, denominator] = rawCR.split("/").map(Number);
    const value = numerator / denominator;
    return Number.isFinite(value) ? value : null;
  }

  const value = Number(rawCR);
  return Number.isFinite(value) ? value : null;
}

/**
 * Get the actor ID stored on an Actor Directory row.
 */
function getRowActorId(row) {
  return (
    row.dataset.documentId ||
    row.dataset.actorId ||
    row.dataset.entryId ||
    row.dataset.entityId
  );
}

/**
 * Sort actor rows by CR (lowest first), then alphabetically by name.
 * Actors without a CR are placed after those with one, alphabetically.
 * Rows are only reordered within their own folder.
 */
function sortActorDirectoryByCR(root) {
  const actorRows = root.querySelectorAll(".directory-item.actor");

  // Group rows by their containing list so folders stay intact.
  const groups = new Map();
  for (const row of actorRows) {
    const parent = row.parentElement;
    if (!parent) continue;
    if (!groups.has(parent)) groups.set(parent, []);
    groups.get(parent).push(row);
  }

  for (const [parent, rows] of groups) {
    const entries = rows.map((row) => {
      const actor = game.actors.get(getRowActorId(row));
      return {
        row,
        cr: getActorCRValue(actor),
        name: actor?.name ?? row.textContent.trim()
      };
    });

    entries.sort((a, b) => {
      if (a.cr !== b.cr) {
        if (a.cr === null) return 1;
        if (b.cr === null) return -1;
        return a.cr - b.cr;
      }
      return a.name.localeCompare(b.name, game.i18n.lang, {
        sensitivity: "base",
        numeric: true
      });
    });

    // Re-appending moves each row to the end, after any subfolders.
    for (const { row } of entries) parent.appendChild(row);
  }
}

/**
 * Add a toggle button to the Actor Directory header for sorting by CR.
 */
function addCRSortToggle(root) {
  if (root.querySelector(".actor-list-cr-sort-toggle")) return;

  const header =
    root.querySelector(".directory-header .header-search") ??
    root.querySelector(".directory-header");
  if (!header) return;

  const active = game.settings.get(MODULE_ID, SORT_SETTING);

  const button = document.createElement("button");
  button.type = "button";
  button.classList.add("actor-list-cr-sort-toggle");
  if (active) button.classList.add("active");
  button.textContent = "CR";
  button.title = active
    ? "Sorting by Challenge Rating (click to disable)"
    : "Sort by Challenge Rating";

  button.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    await game.settings.set(MODULE_ID, SORT_SETTING, !active);
    refreshActorDirectory();
  });

  header.appendChild(button);
}

/**
 * Add CR badges to all actor rows currently visible in the Actor Directory.
 */
function addCRBadgesToActorDirectory(app, html) {
  const root = getHtmlElement(html);
  if (!root) return;

  const actorRows = root.querySelectorAll(".directory-item.actor");

  for (const row of actorRows) {
    // Avoid adding duplicate badges every time the sidebar rerenders.
    if (row.querySelector(".actor-list-cr-badge")) continue;

    const actorId = getRowActorId(row);

    if (!actorId) continue;

    const actor = game.actors.get(actorId);
    const cr = getActorCR(actor);

    if (cr === null) continue;

    row.classList.add("actor-list-cr-row");

    const badge = document.createElement("span");
    badge.classList.add("actor-list-cr-badge");
    badge.textContent = `CR ${cr}`;
    badge.title = `Challenge Rating ${cr}`;

    row.appendChild(badge);
  }

  addCRSortToggle(root);

  if (game.settings.get(MODULE_ID, SORT_SETTING)) {
    sortActorDirectoryByCR(root);
  }
}

/**
 * Ask Foundry to rerender the Actor Directory.
 */
function refreshActorDirectory() {
  const actorDirectory = ui.actors ?? ui.sidebar?.tabs?.actors;

  if (actorDirectory?.render) {
    actorDirectory.render(true);
  }
}

// This is the main hook: when the Actors tab renders, add the CR badges.
Hooks.on("renderActorDirectory", addCRBadgesToActorDirectory);

// Refresh the actor list when actors are created, edited, or deleted.
Hooks.on("createActor", refreshActorDirectory);
Hooks.on("updateActor", refreshActorDirectory);
Hooks.on("deleteActor", refreshActorDirectory);