/**
 * 書いて覚えるプログラミング（タイピング学習）
 * - 表示されたコードと同じ内容をタイプして進める
 * - 空白・改行は学習の負担軽減のため自動消費する
 * - 問題完了後はユーザー操作（Enter / 次の問題へ）で遷移する
 */

const els = {
    topicSelect: document.getElementById("topicSelect"),
    restartBtn: document.getElementById("restartBtn"),
    nextBtn: document.getElementById("nextBtn"),

    topicTitle: document.getElementById("topicTitle"),
    topicMeta: document.getElementById("topicMeta"),
    questionDescription: document.getElementById("questionDescription"),

    typingView: document.getElementById("typingView"),
    messageArea: document.getElementById("messageArea"),

    progress: document.getElementById("progress"),
    total: document.getElementById("total"),

    // キー入力を安定して受けるための不可視 input
    typeInput: document.getElementById("typeInput"),
};

const state = {
    topic: null,
    questionIndex: 0,        // 0-based
    tokens: [],
    tokenIndex: 0,
    typed: "",
    isReadyForNext: false,   // 完了して「次へ待ち」かどうか
};

/* =========================================================
   Tokenize / Escape
   ========================================================= */

/**
 * コードを「タイプ対象のトークン列」に分解する。
 * - 識別子、数値、記号、空白/改行を分けて扱う
 * - 空白/改行は別処理で自動消費する
 */
function tokenize(code) {
    const re =
        /(\r\n|\n)|([ \t]+)|("([^"\\]|\\.)*")|([A-Za-z_][A-Za-z0-9_]*)|(\d+)|([^\s])/g;
    const out = [];
    let m;
    while ((m = re.exec(code))) {
        out.push(m[1] ?? m[2] ?? m[3] ?? m[5] ?? m[6] ?? m[7]);
    }
    return out;
}

function escapeHtml(s) {
    return s.replace(/[&<>"]/g, (c) => {
        const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
        return map[c] ?? c;
    });
}

/* =========================================================
   Focus management
   ========================================================= */

/**
 * 入力がブラウザ外へ飛ばないよう、hidden input にフォーカスを固定する。
 * select 等の操作時は pointerdown 側で除外する。
 */
function ensureFocus() {
    requestAnimationFrame(() => {
        els.typeInput?.focus({ preventScroll: true });
    });
}

/* =========================================================
   Typing mechanics
   ========================================================= */

function advanceWhitespace() {
    while (
        state.tokens[state.tokenIndex] &&
        (/^[ \t]+$/.test(state.tokens[state.tokenIndex]) ||
            state.tokens[state.tokenIndex] === "\n")
    ) {
        state.tokenIndex++;
        state.typed = "";
    }
}

function getCurrentToken() {
    return state.tokens[state.tokenIndex] ?? "";
}

function isQuestionFinished() {
    advanceWhitespace();
    return state.tokenIndex >= state.tokens.length;
}

/* =========================================================
   Rendering
   ========================================================= */

function renderTypingView() {
    advanceWhitespace();

    const doneText = state.tokens.slice(0, state.tokenIndex).join("");
    const current = getCurrentToken();

    // current が変わった等で typed が不整合になったらリセット
    if (current && !current.startsWith(state.typed)) state.typed = "";

    els.typingView.innerHTML =
        `<span class="done">${escapeHtml(doneText)}</span>` +
        `<span class="done">${escapeHtml(state.typed)}</span>` +
        `<span class="next">${escapeHtml(current.slice(state.typed.length))}</span>` +
        `<span class="caret">▍</span>`;

    // 「進捗」は問題数（トークン数ではない）
    els.progress.textContent = String(state.questionIndex + 1);
    els.total.textContent = String(state.topic?.questions.length ?? 0);
}

function renderCompletedView() {
    // 入力済みのコードが消えないよう、トークン全体をそのまま表示する
    els.typingView.innerHTML =
        `<span class="done">${escapeHtml(state.tokens.join(""))}</span>` +
        `<span class="caret">▍</span>`;
}

function setMessage(text, { done = false } = {}) {
    if (!els.messageArea) return;
    els.messageArea.className = done ? "message message--done" : "message";
    els.messageArea.textContent = text ?? "";
}

/* =========================================================
   Topic / Question
   ========================================================= */

async function loadTopic(id) {
    const res = await fetch(`./topics/${id}.json`);
    if (!res.ok) throw new Error(`Failed to load topic: ${id}`);

    state.topic = await res.json();
    setQuestion(0);
}

function setQuestion(index) {
    if (!state.topic) return;

    state.questionIndex = index;

    const q = state.topic.questions[index];
    state.tokens = tokenize(q.code ?? "");
    state.tokenIndex = 0;
    state.typed = "";

    // UI
    els.topicTitle.textContent = state.topic.title ?? "";
    els.topicMeta.textContent = `${index + 1} / ${state.topic.questions.length}`;
    els.questionDescription.textContent = q.description ?? "";

    // 次へ待ちを解除
    state.isReadyForNext = false;
    if (els.nextBtn) els.nextBtn.disabled = true;

    setMessage("");
    renderTypingView();
    ensureFocus();
}

function goNextQuestion() {
    if (!state.topic) return;

    const next = state.questionIndex + 1;
    if (next < state.topic.questions.length) {
        setQuestion(next);
        return;
    }

    // トピック完了
    renderCompletedView();
    setMessage("このトピックは完了しました。お疲れさまでした。", { done: true });
    if (els.nextBtn) els.nextBtn.disabled = true;
    ensureFocus();
}

function setReadyForNext() {
    state.isReadyForNext = true;
    if (els.nextBtn) els.nextBtn.disabled = false;

    // メッセージはコード領域の外へ
    setMessage("この問題は完了しました。内容を確認したら「次の問題へ」または Enter で進めます。", { done: true });
    renderCompletedView();
    ensureFocus();
}

/* =========================================================
   Input handling
   ========================================================= */

function handleBackspace() {
    state.typed = state.typed.slice(0, -1);
    renderTypingView();
}

function handleCharInput(char) {
    const current = getCurrentToken();
    if (!current) return;

    const expected = current[state.typed.length];
    if (char === expected) {
        state.typed += char;

        // トークンを打ち切ったら次トークンへ
        if (state.typed.length === current.length) {
            state.tokenIndex++;
            state.typed = "";

            if (isQuestionFinished()) {
                setReadyForNext();
                return;
            }
        }
    }

    renderTypingView();
}

/* =========================================================
   Events
   ========================================================= */

document.addEventListener("keydown", (e) => {
    if (e.isComposing) return;

    // 完了後は「次へ操作」だけ受け付ける
    if (state.isReadyForNext) {
        if (e.key === "Enter") {
            e.preventDefault();
            goNextQuestion();
        } else if (e.key === "Escape") {
            e.preventDefault();
            setQuestion(state.questionIndex);
        }
        return;
    }

    if (e.key === "Escape") {
        e.preventDefault();
        setQuestion(state.questionIndex);
        return;
    }

    if (e.key === "Backspace") {
        e.preventDefault(); // ブラウザ戻る等の誤動作防止
        handleBackspace();
        return;
    }

    // Space はスクロールを防ぐ（タイプ対象として扱わない設計）
    if (e.key === " ") e.preventDefault();

    // printable character only
    if (e.key.length !== 1) return;
    handleCharInput(e.key);
});

// UI操作（select / button 等）中はフォーカス固定しない
document.addEventListener("pointerdown", (e) => {
    const interactive = e.target.closest(
        "select, option, button, input, textarea, a, label, summary, details"
    );
    if (interactive) return;
    ensureFocus();
});

window.addEventListener("focus", () => ensureFocus());

if (els.nextBtn) {
    els.nextBtn.addEventListener("click", () => {
        if (!state.isReadyForNext) return;
        goNextQuestion();
    });
}

/* =========================================================
   Init
   ========================================================= */

async function init() {
    const res = await fetch("./topics/index.json");
    if (!res.ok) throw new Error("Failed to load topics/index.json");

    const list = await res.json();
    if (!Array.isArray(list) || list.length === 0) {
        throw new Error("topics/index.json is empty or invalid");
    }

    // トピック一覧を select に反映
    els.topicSelect.innerHTML = "";
    for (const t of list) {
        const opt = document.createElement("option");
        opt.value = t.id;
        opt.textContent = t.title;
        els.topicSelect.appendChild(opt);
    }

    els.topicSelect.addEventListener("change", (e) => loadTopic(e.target.value));
    els.restartBtn.addEventListener("click", () => setQuestion(state.questionIndex));

    await loadTopic(list[0].id);
    ensureFocus();
}

init().catch((err) => {
    console.error(err);
    els.typingView.textContent = "初期化に失敗しました。コンソールをご確認ください。";
});
