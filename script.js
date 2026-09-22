const fixedSymbols = ['1', '-', '•', '-', '2', '-', '•', '-', '3', '-', '•', '-', '4', '-', '•', '-'];
const defaultTextColors = { upper: '#e92d3d', lower: '#111111' };
const defaultTexts = [
  { upper: '', lower: 'Tu' }, { upper: 'Tchã\n(opc)', lower: '' }, { upper: '', lower: '' }, { upper: '', lower: '' },
  { upper: '', lower: 'Tum' }, { upper: '', lower: '' }, { upper: 'Tchã', lower: '' }, { upper: '', lower: '' },
  { upper: '', lower: 'Tu' }, { upper: '', lower: '' }, { upper: 'Tchã', lower: '' }, { upper: '', lower: '' },
  { upper: '', lower: 'Tum' }, { upper: '', lower: '' }, { upper: 'Tchã', lower: '' }, { upper: '', lower: '' }
];
const savedPhrases = JSON.parse(localStorage.getItem('solfejo-phrases') || 'null');
const phrases = savedPhrases?.length ? savedPhrases.map(normalizePhrase) : [createDefaultPhrase()];

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
  return {
    title: '',
    cells: fixedSymbols.map((symbol, index) => ({
      symbol,
      upper: defaultTexts[index].upper,
      lower: defaultTexts[index].lower,
      upperColor: defaultTextColors.upper,
      lowerColor: defaultTextColors.lower
    }))
  };
}

function normalizePhrase(phrase) {
  const savedCells = Array.isArray(phrase) ? phrase : phrase.cells;
  return {
    title: Array.isArray(phrase) ? '' : phrase.title || '',
    cells: fixedSymbols.map((symbol, index) => ({
      symbol,
      upper: savedCells?.[index]?.upper || '',
      lower: savedCells?.[index]?.lower || '',
      upperColor: savedCells?.[index]?.upperColor || defaultTextColors.upper,
      lowerColor: savedCells?.[index]?.lowerColor || defaultTextColors.lower
    }))
  };
}

function createCell(cell, phraseIndex, cellIndex) {
  const element = document.createElement('div');
  element.className = 'notation-cell';
  element.innerHTML = `
    <div class="text-field-wrap upper-field"><input class="cell-input upper" data-field="upper" aria-label="Texto acima da marcação ${cellIndex + 1} da frase ${phraseIndex + 1}" placeholder="" value="${escapeAttribute(cell.upper)}"><input class="text-color-picker" data-color-field="upperColor" type="color" aria-label="Cor do texto acima da marcação ${cellIndex + 1}" value="${cell.upperColor}"></div>
    <div class="symbol-wrap"><span class="symbol" aria-label="Marcação fixa ${cell.symbol}">${cell.symbol}</span></div>
    <div class="text-field-wrap lower-field"><input class="cell-input lower" data-field="lower" aria-label="Texto abaixo da marcação ${cellIndex + 1} da frase ${phraseIndex + 1}" placeholder="" value="${escapeAttribute(cell.lower)}"><input class="text-color-picker" data-color-field="lowerColor" type="color" aria-label="Cor do texto abaixo da marcação ${cellIndex + 1}" value="${cell.lowerColor}"></div>
  `;
  element.querySelectorAll('[data-field]').forEach((input) => {
    input.addEventListener('input', () => {
      phrases[phraseIndex].cells[cellIndex][input.dataset.field] = input.value;
      save();
    });
    input.addEventListener('change', () => {
      phrases[phraseIndex].cells[cellIndex][input.dataset.field] = input.value;
      save();
    });
  });
  element.querySelectorAll('[data-color-field]').forEach((picker) => {
    const textInput = picker.parentElement.querySelector('.cell-input');
    textInput.style.color = picker.value;
    picker.addEventListener('input', () => {
      phrases[phraseIndex].cells[cellIndex][picker.dataset.colorField] = picker.value;
      textInput.style.color = picker.value;
      save();
    });
  });
  return element;
}

function renderPhrase(phrase, phraseIndex) {
  const phraseElement = document.createElement('section');
  phraseElement.className = 'phrase';
  const phraseTitleWrap = document.createElement('div');
  phraseTitleWrap.className = 'phrase-title-wrap';
  const phraseTitle = document.createElement('input');
  phraseTitle.className = 'phrase-title';
  phraseTitle.type = 'text';
  phraseTitle.placeholder = `Título da frase ${phraseIndex + 1}`;
  phraseTitle.value = phrase.title;
  phraseTitle.setAttribute('aria-label', `Título da frase ${phraseIndex + 1}`);
  phraseTitle.addEventListener('input', () => {
    phrases[phraseIndex].title = phraseTitle.value;
    save();
  });
  const phraseUnderline = document.createElement('div');
  phraseUnderline.className = 'phrase-title-underline';
  const notation = document.createElement('div');
  notation.className = 'notation';
  notation.setAttribute('aria-label', `Linha da frase ${phraseIndex + 1}`);
  notation.replaceChildren(...phrase.cells.map((cell, cellIndex) => createCell(cell, phraseIndex, cellIndex)));
  phraseTitleWrap.append(phraseTitle, phraseUnderline);
  phraseElement.append(phraseTitleWrap, notation);
  return phraseElement;
}

function render() {
  phrasesElement.replaceChildren(...phrases.map(renderPhrase));
  phraseCount.textContent = phrases.length;
  phraseCount.nextSibling.textContent = phrases.length === 1 ? ' frase' : ' frases';
  document.querySelector('#removePhraseButton').disabled = phrases.length === 1;
  document.querySelectorAll('.symbol').forEach((symbol) => {
    symbol.style.color = colors.symbol;
  });
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
  phrases.push({ ...createDefaultPhrase(), cells: createDefaultPhrase().cells.map((cell) => ({ ...cell, upper: '', lower: '' })) });
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
  Object.assign(colors, { title: '#111111', symbol: '#111111' });
  ['titleColor', 'symbolColor'].forEach((id) => document.querySelector(`#${id}`).value = colors[id.replace('Color', '')]);
  applyColors();
});
['title', 'symbol'].forEach((name) => document.querySelector(`#${name}Color`).addEventListener('input', (event) => { colors[name] = event.target.value; applyColors(); }));
function applyColors() {
  sheetTitle.style.color = colors.title;
  render();
}
render();
