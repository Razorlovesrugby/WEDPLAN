/**
 * Setup, and the only place host permission is requested.
 *
 * The extension ships with no access to the app's origin, because the app's
 * origin is whatever the planner deployed to — so it is requested here, for
 * that one origin, when they save. An extension that asks for every site up
 * front is an extension that can read every site.
 */

const $ = (id) => document.getElementById(id);

async function load() {
  const { appOrigin, clipToken, boards, defaultBoardId } = await chrome.storage.local.get({
    appOrigin: "",
    clipToken: "",
    boards: [],
    defaultBoardId: "",
  });
  $("origin").value = appOrigin;
  $("token").value = clipToken;
  fillBoards(boards, defaultBoardId);
}

function fillBoards(boards, selected) {
  const select = $("board");
  select.innerHTML = '<option value="">First board</option>';
  for (const board of boards) {
    const option = document.createElement("option");
    option.value = board.id;
    option.textContent = board.title;
    if (board.id === selected) option.selected = true;
    select.append(option);
  }
}

function say(message, kind) {
  const status = $("status");
  status.textContent = message;
  status.className = `status ${kind ?? ""}`;
}

$("save").addEventListener("click", async () => {
  const appOrigin = $("origin").value.trim().replace(/\/+$/, "");
  const clipToken = $("token").value.trim();
  if (!appOrigin || !clipToken) return say("Both the address and the token are needed.", "error");

  let granted = false;
  try {
    granted = await chrome.permissions.request({ origins: [`${appOrigin}/*`] });
  } catch (error) {
    return say(String(error), "error");
  }
  if (!granted) return say("Without permission for that address, clips can't be sent.", "error");

  say("Checking…");
  let response;
  try {
    response = await fetch(`${appOrigin}/api/clip/boards`, {
      headers: { authorization: `Bearer ${clipToken}` },
    });
  } catch (error) {
    return say(`Couldn't reach ${appOrigin}: ${error}`, "error");
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    return say(body.error ?? `That address answered ${response.status}.`, "error");
  }

  const { boards, defaultBoardId } = await response.json();
  await chrome.storage.local.set({
    appOrigin,
    clipToken,
    boards,
    defaultBoardId: $("board").value || defaultBoardId || "",
  });
  fillBoards(boards, $("board").value || defaultBoardId || "");
  await chrome.runtime.sendMessage({ type: "wedplan:rebuild-menus" });
  say(`Connected. ${boards.length} board${boards.length === 1 ? "" : "s"} in the right-click menu.`, "ok");
});

$("board").addEventListener("change", async () => {
  await chrome.storage.local.set({ defaultBoardId: $("board").value });
});

$("flush").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "wedplan:flush" });
  const { queue } = await chrome.storage.local.get({ queue: [] });
  say(queue.length === 0 ? "Nothing waiting." : `${queue.length} still waiting.`, queue.length ? "error" : "ok");
});

void load();
