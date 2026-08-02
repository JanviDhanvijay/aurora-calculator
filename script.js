/* ==========================================================================
   AURORA CALCULATOR — SCRIPT
   --------------------------------------------------------------------------
   Structure:
   1. DOM references
   2. Calculator state
   3. Core math helpers
   4. Display rendering
   5. Input handlers (numbers, operators, decimal, equals, clear, delete...)
   6. Button click wiring + ripple effect
   7. Keyboard support
   8. History panel (with localStorage persistence)
   9. Theme toggle
   10. Copy result button
   ========================================================================== */

(() => {
  'use strict';

  /* -----------------------------------------------------------------------
     1. DOM REFERENCES
     -------------------------------------------------------------------- */
  const expressionEl = document.getElementById('expressionEl');
  const resultEl = document.getElementById('resultEl');
  const keypad = document.querySelector('.keypad');

  const themeToggleBtn = document.getElementById('themeToggleBtn');
  const historyToggleBtn = document.getElementById('historyToggleBtn');
  const historyPanel = document.getElementById('historyPanel');
  const historyList = document.getElementById('historyList');
  const historyEmpty = document.getElementById('historyEmpty');
  const clearHistoryBtn = document.getElementById('clearHistoryBtn');
  const copyBtn = document.getElementById('copyBtn');

  /* -----------------------------------------------------------------------
     2. CALCULATOR STATE
     currentValue   — the number currently being typed / displayed
     previousValue  — the number stored before an operator was pressed
     operator       — the pending operator ('+', '−', '×', '÷')
     expression     — human-readable string shown above the result
     justEvaluated  — true right after "=" so the next number starts fresh
     awaitingOperand— true right after an operator is chosen, until the user
                      types a digit/decimal; lets us swap a stacked operator
                      instead of chaining a second calculation
     -------------------------------------------------------------------- */
  const state = {
    currentValue: '0',
    previousValue: null,
    operator: null,
    expression: '',
    justEvaluated: false,
    awaitingOperand: false,
    isError: false,
  };

  const MAX_DIGITS = 15; // guards against runaway display strings

  /* -----------------------------------------------------------------------
     3. CORE MATH HELPERS
     -------------------------------------------------------------------- */

  /**
   * Performs the arithmetic for a given operator.
   * Throws an Error for divide-by-zero so callers can show a friendly message.
   */
  function compute(a, b, op) {
    const numA = parseFloat(a);
    const numB = parseFloat(b);

    switch (op) {
      case '+':
        return numA + numB;
      case '−':
        return numA - numB;
      case '×':
        return numA * numB;
      case '÷':
        if (numB === 0) {
          throw new Error('DIV_BY_ZERO');
        }
        return numA / numB;
      default:
        return numB;
    }
  }

  /**
   * Rounds floating point results to avoid ugly artifacts like 0.1 + 0.2,
   * then trims the string down so it doesn't overflow the display.
   */
  function cleanNumber(num) {
    if (!isFinite(num)) return 'Error';

    let rounded = parseFloat(num.toFixed(10));
    let str = rounded.toString();

    if (str.replace('-', '').replace('.', '').length > MAX_DIGITS) {
      str = num.toExponential(6);
    }
    return str;
  }

  /* -----------------------------------------------------------------------
     4. DISPLAY RENDERING
     -------------------------------------------------------------------- */
  function formatForDisplay(numStr) {
    if (numStr === 'Error' || numStr === undefined || numStr === null) return 'Error';

    const isNegative = numStr.toString().startsWith('-');
    const clean = isNegative ? numStr.toString().slice(1) : numStr.toString();
    const [intPart, decPart] = clean.split('.');
    const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

    let formatted = withCommas;
    if (decPart !== undefined) {
      formatted += '.' + decPart;
    }
    return (isNegative ? '-' : '') + formatted;
  }

  function render() {
    // Result / current value
    resultEl.textContent = state.isError ? 'Error' : formatForDisplay(state.currentValue);
    resultEl.classList.toggle('is-error', state.isError);

    // Expression line (shows the full running calculation)
    expressionEl.textContent = state.expression || '\u00A0';

    // Highlight the active operator button, if any
    document.querySelectorAll('.btn--operator').forEach((btn) => {
      btn.classList.toggle(
        'is-active',
        !state.justEvaluated && !state.isError && btn.dataset.operator === state.operator
      );
    });
  }

  /* -----------------------------------------------------------------------
     5. INPUT HANDLERS
     -------------------------------------------------------------------- */

  function inputDigit(digit) {
    if (state.isError) resetAfterError();

    if (state.justEvaluated) {
      // Start a brand new number after a completed calculation
      state.currentValue = digit;
      state.expression = '';
      state.justEvaluated = false;
    } else if (state.awaitingOperand) {
      // First digit typed after choosing an operator
      state.currentValue = digit;
      state.awaitingOperand = false;
    } else if (state.currentValue === '0') {
      state.currentValue = digit;
    } else if (state.currentValue.replace('-', '').replace('.', '').length < MAX_DIGITS) {
      state.currentValue += digit;
    }
    render();
  }

  function inputDecimal() {
    if (state.isError) resetAfterError();

    if (state.justEvaluated) {
      state.currentValue = '0.';
      state.expression = '';
      state.justEvaluated = false;
    } else if (state.awaitingOperand) {
      state.currentValue = '0.';
      state.awaitingOperand = false;
    } else if (!state.currentValue.includes('.')) {
      state.currentValue += '.';
    }
    render();
  }

  function inputOperator(op) {
    if (state.isError) resetAfterError();

    // Operator pressed again before any new digit was typed: just swap it
    // (this is what "prevents multiple operators in sequence" — 5 + × means "5 ×").
    if (state.operator && state.awaitingOperand) {
      state.operator = op;
      state.expression = `${formatForDisplay(state.previousValue)} ${op}`;
      render();
      return;
    }

    if (state.operator !== null && !state.justEvaluated) {
      // Chain left-to-right, like a standard four-function calculator:
      // 4 + 3 × → evaluates 4+3 first, then waits for the next operand.
      try {
        const result = compute(state.previousValue, state.currentValue, state.operator);
        state.previousValue = cleanNumber(result);
      } catch (e) {
        showError();
        return;
      }
    } else {
      state.previousValue = state.currentValue;
    }

    state.operator = op;
    state.currentValue = state.previousValue;
    state.justEvaluated = false;
    state.awaitingOperand = true;
    state.expression = `${formatForDisplay(state.previousValue)} ${op}`;
    render();
  }

  function inputEquals() {
    if (state.isError) return;
    if (state.operator === null || state.previousValue === null || state.awaitingOperand) return;

    const fullExpression = `${formatForDisplay(state.previousValue)} ${state.operator} ${formatForDisplay(state.currentValue)}`;

    try {
      const result = compute(state.previousValue, state.currentValue, state.operator);
      const cleaned = cleanNumber(result);

      addHistoryEntry(fullExpression, formatForDisplay(cleaned));

      state.currentValue = cleaned;
      state.previousValue = null;
      state.operator = null;
      state.expression = fullExpression + ' =';
      state.justEvaluated = true;
      render();
    } catch (e) {
      showError();
    }
  }

  function inputPercent() {
    if (state.isError) resetAfterError();
    const value = parseFloat(state.currentValue || '0');

    // With a pending operator, treat % as "percentage of previousValue"
    // (e.g. 200 + 10% behaves like 200 + 20). Otherwise, just divide by 100.
    let result;
    if (state.operator && state.previousValue !== null) {
      result = (parseFloat(state.previousValue) * value) / 100;
    } else {
      result = value / 100;
    }
    state.currentValue = cleanNumber(result);
    state.awaitingOperand = false;
    render();
  }

  function inputNegate() {
    if (state.isError) resetAfterError();
    if (state.currentValue === '0') return;
    state.currentValue = state.currentValue.startsWith('-')
      ? state.currentValue.slice(1)
      : '-' + state.currentValue;
    render();
  }

  function inputDelete() {
    if (state.isError) {
      resetAfterError();
      render();
      return;
    }
    if (state.justEvaluated) return; // nothing sensible to delete right after "="

    if (state.currentValue.length <= 1 || (state.currentValue.length === 2 && state.currentValue.startsWith('-'))) {
      state.currentValue = '0';
    } else {
      state.currentValue = state.currentValue.slice(0, -1);
    }
    render();
  }

  function clearAll() {
    state.currentValue = '0';
    state.previousValue = null;
    state.operator = null;
    state.expression = '';
    state.justEvaluated = false;
    state.awaitingOperand = false;
    state.isError = false;
    render();
  }

  function showError() {
    state.isError = true;
    state.currentValue = 'Error';
    state.expression = 'Cannot divide by zero';
    render();
  }

  function resetAfterError() {
    state.isError = false;
    state.currentValue = '0';
    state.previousValue = null;
    state.operator = null;
    state.expression = '';
    state.awaitingOperand = false;
  }

  /* -----------------------------------------------------------------------
     6. BUTTON CLICK WIRING + RIPPLE EFFECT
     -------------------------------------------------------------------- */

  function spawnRipple(button, clientX, clientY) {
    const rect = button.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const ripple = document.createElement('span');

    ripple.className = 'ripple';
    ripple.style.width = ripple.style.height = `${size}px`;
    ripple.style.left = `${(clientX ?? rect.left + rect.width / 2) - rect.left - size / 2}px`;
    ripple.style.top = `${(clientY ?? rect.top + rect.height / 2) - rect.top - size / 2}px`;

    button.appendChild(ripple);
    ripple.addEventListener('animationend', () => ripple.remove());
  }

  keypad.addEventListener('click', (event) => {
    const button = event.target.closest('.btn');
    if (!button) return;

    spawnRipple(button, event.clientX, event.clientY);
    handleAction(button);
  });

  function handleAction(button) {
    const { action, value, operator } = button.dataset;

    switch (action) {
      case 'number':
        inputDigit(value);
        break;
      case 'decimal':
        inputDecimal();
        break;
      case 'operator':
        inputOperator(operator);
        break;
      case 'equals':
        inputEquals();
        break;
      case 'percent':
        inputPercent();
        break;
      case 'negate':
        inputNegate();
        break;
      case 'delete':
        inputDelete();
        break;
      case 'clear':
        clearAll();
        break;
      default:
        break;
    }
  }

  /* -----------------------------------------------------------------------
     7. KEYBOARD SUPPORT
     -------------------------------------------------------------------- */
  const KEY_TO_OPERATOR = {
    '+': '+',
    '-': '−',
    '*': '×',
    'x': '×',
    'X': '×',
    '/': '÷',
  };

  window.addEventListener('keydown', (event) => {
    const { key } = event;
    let selector = null;

    if (/^[0-9]$/.test(key)) {
      inputDigit(key);
      selector = `.btn--number[data-value="${key}"]`;
    } else if (key === '.') {
      inputDecimal();
      selector = '.btn--number[data-action="decimal"]';
    } else if (KEY_TO_OPERATOR[key]) {
      inputOperator(KEY_TO_OPERATOR[key]);
      selector = `.btn--operator[data-operator="${KEY_TO_OPERATOR[key]}"]`;
    } else if (key === 'Enter' || key === '=') {
      event.preventDefault();
      inputEquals();
      selector = '.btn--equals';
    } else if (key === 'Backspace') {
      inputDelete();
      selector = '.btn--function[data-action="delete"]';
    } else if (key === 'Delete' || key === 'Escape') {
      clearAll();
      selector = '.btn--function[data-action="clear"]';
    } else if (key === '%') {
      inputPercent();
      selector = '.btn--function[data-action="percent"]';
    } else {
      return; // not a key we handle — don't hijack focus/ripple below
    }

    if (selector) {
      const btn = document.querySelector(selector);
      if (btn) {
        btn.classList.add('is-pressed');
        spawnRipple(btn);
        setTimeout(() => btn.classList.remove('is-pressed'), 150);
      }
    }
  });

  /* -----------------------------------------------------------------------
     8. HISTORY PANEL (persisted with localStorage)
     -------------------------------------------------------------------- */
  const HISTORY_KEY = 'aurora-calc-history';
  let history = loadHistory();

  function loadHistory() {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveHistory() {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch (e) {
      // localStorage may be unavailable (e.g. private browsing) — fail silently.
    }
  }

  function addHistoryEntry(expression, result) {
    history.unshift({ expression, result, id: Date.now() });
    if (history.length > 50) history.pop(); // keep the list from growing forever
    saveHistory();
    renderHistory();
  }

  function renderHistory() {
    // Clear existing entries (but keep the "empty" placeholder node around)
    historyList.querySelectorAll('.history-item').forEach((el) => el.remove());

    if (history.length === 0) {
      historyEmpty.style.display = 'block';
      return;
    }
    historyEmpty.style.display = 'none';

    history.forEach((entry) => {
      const li = document.createElement('li');
      li.className = 'history-item';
      li.tabIndex = 0;
      li.setAttribute('role', 'button');
      li.setAttribute('aria-label', `Recall ${entry.expression} equals ${entry.result}`);

      const expr = document.createElement('div');
      expr.className = 'h-expression';
      expr.textContent = entry.expression;

      const res = document.createElement('div');
      res.className = 'h-result';
      res.textContent = entry.result;

      li.append(expr, res);

      // Clicking a history item recalls its result into the display.
      const recall = () => {
        state.currentValue = entry.result.replace(/,/g, '');
        state.previousValue = null;
        state.operator = null;
        state.expression = '';
        state.justEvaluated = true;
        state.awaitingOperand = false;
        state.isError = false;
        render();
      };
      li.addEventListener('click', recall);
      li.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          recall();
        }
      });

      historyList.appendChild(li);
    });
  }

  clearHistoryBtn.addEventListener('click', () => {
    history = [];
    saveHistory();
    renderHistory();
  });

  historyToggleBtn.addEventListener('click', () => {
    const isHidden = historyPanel.hasAttribute('hidden');
    if (isHidden) {
      historyPanel.removeAttribute('hidden');
    } else {
      historyPanel.setAttribute('hidden', '');
    }
    historyToggleBtn.setAttribute('aria-pressed', String(isHidden));
  });

  /* -----------------------------------------------------------------------
     9. THEME TOGGLE (persisted with localStorage)
     -------------------------------------------------------------------- */
  const THEME_KEY = 'aurora-calc-theme';

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    themeToggleBtn.setAttribute('aria-pressed', String(theme === 'light'));
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch (e) {
      /* ignore */
    }
  }

  function initTheme() {
    let saved;
    try {
      saved = localStorage.getItem(THEME_KEY);
    } catch (e) {
      saved = null;
    }
    if (saved) {
      applyTheme(saved);
    } else {
      // Respect the user's OS-level preference on first visit.
      const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
      applyTheme(prefersLight ? 'light' : 'dark');
    }
  }

  themeToggleBtn.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    applyTheme(current === 'light' ? 'dark' : 'light');
  });

  /* -----------------------------------------------------------------------
     10. COPY RESULT BUTTON
     -------------------------------------------------------------------- */
  copyBtn.addEventListener('click', async () => {
    const textToCopy = state.isError ? '' : resultEl.textContent;
    if (!textToCopy) return;

    try {
      await navigator.clipboard.writeText(textToCopy.replace(/,/g, ''));
      copyBtn.setAttribute('title', 'Copied!');
      copyBtn.style.color = 'var(--glow-cyan)';
      setTimeout(() => {
        copyBtn.setAttribute('title', 'Copy result');
        copyBtn.style.color = '';
      }, 1200);
    } catch (e) {
      // Clipboard API may be unavailable (e.g. insecure context) — fail silently.
    }
  });

  /* -----------------------------------------------------------------------
     INITIALIZATION
     -------------------------------------------------------------------- */
  initTheme();
  renderHistory();
  render();
})();
