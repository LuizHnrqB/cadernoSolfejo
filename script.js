const fixedSymbols = ['1', '-', '•', '-', '2', '-', '•', '-', '3', '-', '•', '-', '4', '-', '•', '-'];
const defaultTexts = [
  { upper: '', lower: 'Tu' }, { upper: 'Tchã\n(opc)', lower: '' }, { upper: '', lower: '' }, { upper: '', lower: '' },
  { upper: '', lower: 'Tum' }, { upper: '', lower: '' }, { upper: 'Tchã', lower: '' }, { upper: '', lower: '' },
  { upper: '', lower: 'Tu' }, { upper: '', lower: '' }, { upper: 'Tchã', lower: '' }, { upper: '', lower: '' },
  { upper: '', lower: 'Tum' }, { upper: '', lower: '' }, { upper: 'Tchã', lower: '' }, { upper: '', lower: '' }
];
const savedPhrases = JSON.parse(localStorage.getItem('solfejo-phrases') || 'null');
const phrases = savedPhrases?.length ? savedPhrases : [createDefaultPhrase()];

const phrasesElement = document.querySelector('#phrases');
const titleInput = document.querySelector('#titleInput');
const sheetTitle = document.querySelector('#sheetTitle');
const phraseCount = document.querySelector('#phraseCount');
const colors = { title: '#111111', symbol: '#111111', upper: '#e92d3d', lower: '#111111' };

function save() {
  localStorage.setItem('solfejo-phrases', JSON.stringify(phrases));
  localStorage.setItem('solfejo-title', sheetTitle.value);
}

function createDefaultPhrase() {
  return fixedSymbols.map((symbol, index) => ({
    symbol,
    upper: defaultTexts[index].upper,
    lower: defaultTexts[index].lower
  }));
}

function createCell(cell, phraseIndex, cellIndex) {
  const element = document.createElement('div');
  element.className = 'notation-cell';
  element.innerHTML = `
    <input class="cell-input upper" data-field="upper" aria-label="Texto acima da marcação ${cellIndex + 1} da frase ${phraseIndex + 1}" placeholder="" value="${escapeAttribute(cell.upper)}">
    <div class="symbol-wrap"><span class="symbol" aria-label="Marcação fixa ${cell.symbol}">${cell.symbol}</span></div>
    <input class="cell-input lower" data-field="lower" aria-label="Texto abaixo da marcação ${cellIndex + 1} da frase ${phraseIndex + 1}" placeholder="" value="${escapeAttribute(cell.lower)}">
  `;
  element.querySelectorAll('[data-field]').forEach((input) => {
    input.addEventListener('input', () => {
      phrases[phraseIndex][cellIndex][input.dataset.field] = input.value;
      save();
    });
    input.addEventListener('change', () => {
      phrases[phraseIndex][cellIndex][input.dataset.field] = input.value;
      save();
    });
  });
  return element;
}

function renderPhrase(phrase, phraseIndex) {
  const notation = document.createElement('div');
  notation.className = 'notation';
  notation.setAttribute('aria-label', `Linha da frase ${phraseIndex + 1}`);
  notation.replaceChildren(...phrase.map((cell, cellIndex) => createCell(cell, phraseIndex, cellIndex)));
  return notation;
}

function render() {
  phrasesElement.replaceChildren(...phrases.map(renderPhrase));
  phraseCount.textContent = phrases.length;
  phraseCount.nextSibling.textContent = phrases.length === 1 ? ' frase' : ' frases';
  document.querySelector('#removePhraseButton').disabled = phrases.length === 1;
  document.querySelectorAll('.symbol').forEach((symbol) => {
    symbol.style.color = colors.symbol;
  });
  document.querySelectorAll('.cell-input.upper').forEach((input) => input.style.color = colors.upper);
  document.querySelectorAll('.cell-input.lower').forEach((input) => input.style.color = colors.lower);
}

function escapeAttribute(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

titleInput.value = localStorage.getItem('solfejo-title') || 'Xote';
sheetTitle.value = titleInput.value;
titleInput.addEventListener('input', () => { sheetTitle.value = titleInput.value; save(); });
sheetTitle.addEventListener('input', () => { titleInput.value = sheetTitle.value; save(); });
document.querySelector('#printButton').addEventListener('click', () => window.print());
document.querySelector('#addPhraseButton').addEventListener('click', () => {
  phrases.push(createDefaultPhrase().map((cell) => ({ ...cell, upper: '', lower: '' })));
  render();
  save();
});
document.querySelector('#removePhraseButton').addEventListener('click', () => {
  if (phrases.length === 1) return;
  phrases.pop();
  render();
  save();
});
document.querySelector('#resetColors').addEventListener('click', () => {
  Object.assign(colors, { title: '#111111', symbol: '#111111', upper: '#e92d3d', lower: '#111111' });
  ['titleColor', 'symbolColor', 'upperColor', 'lowerColor'].forEach((id) => document.querySelector(`#${id}`).value = colors[id.replace('Color', '')]);
  applyColors();
});
['title', 'symbol', 'upper', 'lower'].forEach((name) => document.querySelector(`#${name}Color`).addEventListener('input', (event) => { colors[name] = event.target.value; applyColors(); }));
function applyColors() {
  sheetTitle.style.color = colors.title;
  render();
}
render();
