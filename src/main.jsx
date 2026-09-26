import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useSpeak, useVoices } from 'react-text-to-speech';
import * as Tone from 'tone';

const defaultPalette = { title: '#16233f', symbol: '#16233f', upper: '#2a5578', lower: '#16233f' };
const legacyDefaultPalette = { title: '#111111', symbol: '#111111', upper: '#e92d3d', lower: '#111111' };
const knownDefaultPalettes = [
  legacyDefaultPalette,
  { title: '#edf3f5', symbol: '#edf3f5', upper: '#f06d5e', lower: '#edf3f5' },
  { title: '#efeada', symbol: '#efeada', upper: '#c98a2c', lower: '#efeada' }
];
const zabumbaSyllables = ['', 'Tu', 'Tum', 'Ku', 'Tchá', 'Ká'];
const defaultTexts = [
  { upper: '', lower: 'Tu' }, { upper: 'Tchá', lower: '' }, { upper: '', lower: '' }, { upper: '', lower: '' },
  { upper: '', lower: 'Tum' }, { upper: '', lower: '' }, { upper: 'Tchá', lower: '' }, { upper: '', lower: '' },
  { upper: '', lower: 'Tu' }, { upper: '', lower: '' }, { upper: 'Ká', lower: '' }, { upper: '', lower: '' },
  { upper: '', lower: 'Ku' }, { upper: '', lower: '' }, { upper: 'Ká', lower: '' }, { upper: '', lower: '' }
];

/**
 * Calcula o símbolo fixo exibido em uma célula do solfejo numérico.
 * @param {number} index Índice absoluto da célula na frase (0-based).
 * @returns {string} Número do tempo, ponto (•) ou traço (-).
 */
function numericSymbol(index) {
  const position = index % 4;
  return position === 0 ? String(Math.floor(index / 4) + 1) : position === 2 ? '•' : '-';
}

/**
 * Gera as células do solfejo numérico para uma frase, reaproveitando valores salvos quando existirem.
 * @param {number} beatCount Quantidade de tempos da frase.
 * @param {Array<object>} [savedCells] Células previamente salvas, usadas para preservar edições do usuário.
 * @returns {Array<{symbol: string, noteState: string, upper: string, lower: string}>}
 */
function createCells(beatCount, savedCells = []) {
  return Array.from({ length: beatCount * 4 }, (_, index) => ({
    symbol: numericSymbol(index),
    noteState: ['empty', 'filled', 'roll'].includes(savedCells[index]?.noteState) ? savedCells[index].noteState : 'empty',
    upper: savedCells[index]?.upper ?? defaultTexts[index % defaultTexts.length].upper,
    lower: savedCells[index]?.lower ?? defaultTexts[index % defaultTexts.length].lower
  }));
}

/**
 * Cria uma nova frase com valores padrão.
 * @param {boolean} [clearText] Quando true, remove os textos padrão das células (usado ao duplicar/adicionar frases).
 * @returns {object} Frase pronta para ser inserida no estado da página.
 */
function createPhrase(clearText = false) {
  const phrase = {
    title: '',
    palette: { ...defaultPalette },
    noteMode: false,
    beatCount: 4,
    bpm: 80,
    groupId: null,
    groupTitle: '',
    noteCells: Array.from({ length: 32 }, () => ({ state: 'empty' })),
    cells: createCells(4)
  };
  if (clearText) phrase.cells = phrase.cells.map((cell) => ({ ...cell, upper: '', lower: '' }));
  return phrase;
}

/**
 * Normaliza uma frase carregada do localStorage (ou de um arquivo importado), preenchendo campos
 * ausentes e migrando paletas de cor de versões antigas para a paleta atual.
 * @param {object|Array} saved Dado salvo, podendo estar no formato legado (array de células).
 * @returns {object} Frase normalizada e segura para uso no app.
 */
function normalizePhrase(saved) {
  const legacy = Array.isArray(saved);
  const beatCount = Math.min(8, Math.max(1, Number(saved.beatCount) || 4));
  const cells = legacy ? saved : saved.cells;
  const savedPalette = legacy ? {} : saved.palette || {};
  const palette = Object.fromEntries(Object.entries(defaultPalette).map(([key, value]) => [key, knownDefaultPalettes.some((known) => savedPalette[key] === known[key]) ? value : savedPalette[key] || value]));
  return {
    title: legacy ? '' : saved.title || '',
    palette,
    noteMode: legacy ? false : Boolean(saved.noteMode),
    beatCount,
    bpm: Math.min(240, Math.max(30, Number(saved.bpm) || 80)),
    groupId: legacy ? null : saved.groupId || null,
    groupTitle: legacy ? '' : saved.groupTitle || '',
    noteCells: Array.from({ length: 32 }, (_, index) => ({ state: ['empty', 'filled', 'roll'].includes(saved.noteCells?.[index]?.state) ? saved.noteCells[index].state : 'empty' })),
    cells: createCells(beatCount, cells)
  };
}

/**
 * Lê as frases salvas no formato legado (antes da existência de páginas).
 * @returns {Array<object>} Lista de frases normalizadas, ou uma frase em branco se não houver dados.
 */
function loadPhrases() {
  try {
    const saved = JSON.parse(localStorage.getItem('solfejo-phrases') || 'null');
    return saved?.length ? saved.map(normalizePhrase) : [createPhrase()];
  } catch {
    return [createPhrase()];
  }
}

/**
 * Avança o estado de uma nota do modo "Notas" no ciclo vazio → cheia → rulo.
 * @param {'empty'|'filled'|'roll'} state Estado atual da nota.
 * @returns {'empty'|'filled'|'roll'} Próximo estado do ciclo.
 */
function nextNoteState(state) {
  const states = ['empty', 'filled', 'roll'];
  return states[(states.indexOf(state) + 1) % states.length];
}

/**
 * Texto que deve ser falado durante a leitura de uma célula do solfejo numérico.
 * @param {{lower: string}} cell Célula da frase.
 * @returns {string} Texto (linha inferior) sem espaços nas pontas.
 */
function narrationForCell(cell) {
  return cell.lower.trim();
}

/**
 * Onomatopeia falada para cada estado de nota no modo "Notas".
 * @param {{state: 'empty'|'filled'|'roll'}} note Nota a ser narrada.
 * @returns {string} Palavra a ser falada.
 */
function narrationForNote(note) {
  return { filled: 'Pá', empty: 'ti', roll: 'tirr' }[note.state];
}

/**
 * Remove acentos e normaliza caixa/espaços para permitir comparação simples de sílabas.
 * @param {string} text Texto original digitado/selecionado pelo usuário.
 * @returns {string} Texto normalizado (minúsculo, sem diacríticos).
 */
function normalizeSyllable(text) {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

/**
 * Classifica a célula do solfejo numérico em um ou mais timbres de zabumba a partir das sílabas
 * escolhidas (linha de cima e/ou de baixo). Tu = grave preso; Tum/Ku = grave aberto; Tchá/Ká = agudo
 * (pele de resposta). Quando as duas linhas têm sílaba, ambos os timbres tocam juntos.
 * @param {{upper: string, lower: string}} cell Célula a ser classificada.
 * @returns {Array<'preso'|'aberto'|'agudo'>} Timbres a tocar (vazio se nenhuma sílaba for reconhecida).
 */
function zabumbaTonesForCell(cell) {
  const tones = [];
  for (const raw of [cell.lower, cell.upper]) {
    const text = normalizeSyllable(raw || '');
    if (!text) continue;
    if (/\btcha\b|\bka\b/.test(text)) tones.push('agudo');
    else if (/\btum\b|\bku\b/.test(text)) tones.push('aberto');
    else if (/\btu\b/.test(text)) tones.push('preso');
  }
  return tones;
}

/**
 * Gera um identificador único para um grupo de frases.
 * @returns {string} Identificador do grupo.
 */
function createGroupId() {
  return `group-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Aplica uma atualização imutável a uma única frase de uma lista.
 * @param {Array<object>} phrases Lista completa de frases da página.
 * @param {number} phraseIndex Índice da frase a atualizar.
 * @param {(phrase: object) => object} update Função que recebe a frase atual e retorna a nova versão.
 * @returns {Array<object>} Nova lista de frases com a atualização aplicada.
 */
function updatePhrase(phrases, phraseIndex, update) {
  return phrases.map((phrase, index) => index === phraseIndex ? update(phrase) : phrase);
}

/**
 * Dissolve grupos que ficaram com apenas uma frase, devolvendo-a ao estado independente.
 * @param {Array<object>} phrases Lista de frases da página.
 * @returns {Array<object>} Lista de frases com grupos de um único membro desfeitos.
 */
function releaseSingletonGroups(phrases) {
  const counts = phrases.reduce((acc, phrase) => {
    if (phrase.groupId) acc[phrase.groupId] = (acc[phrase.groupId] || 0) + 1;
    return acc;
  }, {});
  return phrases.map((phrase) => (phrase.groupId && counts[phrase.groupId] === 1) ? { ...phrase, groupId: null, groupTitle: '' } : phrase);
}

/**
 * Gera um identificador único para uma página do caderno.
 * @returns {string} Identificador da página.
 */
function createPageId() {
  return `page-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Cria uma nova página com uma frase em branco.
 * @param {string} [title] Título inicial da página.
 * @returns {{id: string, title: string, phrases: Array<object>}}
 */
function createPage(title = '') {
  return { id: createPageId(), title, phrases: [createPhrase(true)] };
}

/**
 * Carrega as páginas salvas no localStorage, migrando dados do formato legado (sem páginas) quando necessário.
 * @returns {Array<{id: string, title: string, phrases: Array<object>}>} Lista de páginas prontas para uso.
 */
function loadPages() {
  try {
    const saved = JSON.parse(localStorage.getItem('solfejo-pages') || 'null');
    if (Array.isArray(saved) && saved.length) {
      return saved.map((page) => ({
        id: page.id || createPageId(),
        title: page.title || '',
        phrases: Array.isArray(page.phrases) && page.phrases.length ? page.phrases.map(normalizePhrase) : [createPhrase()]
      }));
    }
  } catch {
    // ignora dados corrompidos e recorre à migração abaixo
  }
  const legacyTitle = localStorage.getItem('solfejo-title');
  const legacyPhrases = localStorage.getItem('solfejo-phrases');
  if (legacyTitle || legacyPhrases) return [{ id: createPageId(), title: legacyTitle || '', phrases: loadPhrases() }];
  return [createPage()];
}

/** Callback de parada da leitura em andamento (garante que apenas uma frase toque por vez). */
let activePlaybackStop = null;

/**
 * Botão + diálogo modal para editar as cores (título, marcação, textos) de uma frase.
 * @param {{phrase: object, phraseIndex: number, onChange: (key: string, value: string) => void}} props
 */
function PaletteDialog({ phrase, phraseIndex, onChange }) {
  const dialogRef = useRef(null);
  return <>
    <button className="phrase-palette-button" type="button" onClick={() => dialogRef.current?.showModal()}>
      <span aria-hidden="true">Paleta</span>
      <span>Paleta da frase</span>
    </button>
    <dialog className="phrase-palette-dialog" ref={dialogRef}>
      <form method="dialog">
        <div className="dialog-heading"><strong>Paleta da frase {phraseIndex + 1}</strong><button className="dialog-close" value="cancel" aria-label="Fechar">×</button></div>
        {Object.entries({ title: 'Título', symbol: 'Marcação', upper: 'Texto acima', lower: 'Texto abaixo' }).map(([key, label]) => (
          <label className="color-row" key={key}>{label}<input type="color" value={phrase.palette[key]} onChange={(event) => onChange(key, event.target.value)} /></label>
        ))}
      </form>
    </dialog>
  </>;
}

/**
 * Grade de células do solfejo numérico (números, pontos e traços) com seletores de som acima/abaixo.
 * @param {{phrase: object, phraseIndex: number, onCellChange: (cellIndex: number, key: 'upper'|'lower', value: string) => void}} props
 */
function NumericNotation({ phrase, phraseIndex, onCellChange }) {
  return <div className="notation" aria-label={`Linha da frase ${phraseIndex + 1}`} style={{ '--phrase-columns': phrase.cells.length, '--symbol-size': `${Math.max(24, Math.min(68, 1080 / phrase.cells.length))}px` }}>
    {phrase.cells.map((cell, cellIndex) => <div className="notation-cell" key={cellIndex}>
      <div className="text-field-wrap upper-field"><select className={`cell-input upper${cell.upper.trim() ? ' has-content' : ''}`} value={cell.upper} aria-label={`Som acima da marcação ${cellIndex + 1} da frase ${phraseIndex + 1}`} onChange={(event) => onCellChange(cellIndex, 'upper', event.target.value)}>{zabumbaSyllables.map((syllable) => <option key={syllable || 'vazio'} value={syllable}>{syllable || '—'}</option>)}</select><span className="print-text upper">{cell.upper}</span></div>
      <div className="symbol-wrap"><span className="symbol dash-symbol" aria-label={`Marcação fixa ${cell.symbol}`}>{cell.symbol}</span></div>
      <div className="text-field-wrap lower-field"><select className={`cell-input lower${cell.lower.trim() ? ' has-content' : ''}`} value={cell.lower} aria-label={`Som abaixo da marcação ${cellIndex + 1} da frase ${phraseIndex + 1}`} onChange={(event) => onCellChange(cellIndex, 'lower', event.target.value)}>{zabumbaSyllables.map((syllable) => <option key={syllable || 'vazio'} value={syllable}>{syllable || '—'}</option>)}</select><span className="print-text lower">{cell.lower}</span></div>
    </div>)}
  </div>;
}

/**
 * Grade de notas musicais (círculos/hastes) do modo "Notas", clicáveis para alternar vazio/cheio/rulo.
 * @param {{phrase: object, phraseIndex: number, onNoteChange: (index: number) => void, activeCellIndex: number|null}} props
 */
function NoteNotation({ phrase, phraseIndex, onNoteChange, activeCellIndex }) {
  return <div className="note-notation" aria-label={`Linha de notas da frase ${phraseIndex + 1}`} style={{ '--phrase-columns': phrase.beatCount }}>
    {Array.from({ length: phrase.beatCount }, (_, groupIndex) => <div className="note-group" key={groupIndex}>
      {Array.from({ length: 4 }, (_, noteIndex) => {
        const index = groupIndex * 4 + noteIndex;
        const note = phrase.noteCells[index];
        return <button className={`musical-note note-state-${note.state}${activeCellIndex === index ? ' is-reading' : ''}`} type="button" key={index} aria-label={`Nota ${index + 1}. Clique para alterar`} onClick={() => onNoteChange(index)}><span className="note-head"></span><span className="note-stem"></span><span className="note-rulo"></span></button>;
      })}
    </div>)}
  </div>;
}

/**
 * Cartão de uma frase musical: cabeçalho (título, BPM, modo), notação (numérica ou de notas) e a
 * leitura sincronizada via Tone.js (sintetizando os timbres de zabumba ou narrando por voz).
 * @param {{
 *   phrase: object,
 *   phraseIndex: number,
 *   phraseCount: number,
 *   onChange: (update: (phrase: object) => object) => void,
 *   onAddToGroup: () => void,
 *   onDuplicate: () => void,
 *   onRemove: () => void,
 *   onUngroup: () => void
 * }} props
 */
function Phrase({ phrase, phraseIndex, phraseCount, onChange, onAddToGroup, onDuplicate, onRemove, onUngroup }) {
  // alterna o tom de fundo (azul/dourado) entre frases consecutivas
  const style = { '--phrase-bg': `color-mix(in srgb, ${phraseIndex % 2 === 0 ? 'var(--blue)' : 'var(--cream)'} 18%, #fffdf4)`, '--phrase-title': phrase.palette.title, '--symbol': phrase.palette.symbol, '--upper': phrase.palette.upper, '--lower': phrase.palette.lower };
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeCellIndex, setActiveCellIndex] = useState(null);
  const [bpmInput, setBpmInput] = useState(String(phrase.bpm));
  const toneSequenceRef = useRef(null);
  const drumBuffersRef = useRef(null);
  const zabumbaBuffersRef = useRef(null);
  const { speak, stop: stopSpeech } = useSpeak({
    preserveUtteranceQueue: false,
    onStart: () => {}
  });
  const { voices } = useVoices();
  const portugueseVoices = voices.filter((voice) => voice.lang.toLowerCase() === 'pt-br');
  const portugueseVoice = portugueseVoices.find((voice) => /maria|female|feminina/i.test(voice.name)) || portugueseVoices[0];
  /**
   * Gera (uma vez) e memoriza os buffers de áudio dos três estados de nota do modo "Notas".
   * @returns {{empty: AudioBuffer, filled: AudioBuffer, roll: AudioBuffer}}
   */
  const prepareDrumBuffers = () => {
    if (drumBuffersRef.current) return drumBuffersRef.current;
    const audioContext = Tone.getContext().rawContext;
    drumBuffersRef.current = ['empty', 'filled', 'roll'].reduce((buffers, state) => {
      const duration = state === 'roll' ? 0.095 : 0.13;
      const buffer = audioContext.createBuffer(1, Math.ceil(audioContext.sampleRate * duration), audioContext.sampleRate);
      const data = buffer.getChannelData(0);
      // nota vazia = nota fantasma: bem mais baixa que as demais
      const level = state === 'filled' ? 0.72 : state === 'roll' ? 0.58 : 0.18;
      for (let index = 0; index < data.length; index += 1) {
        const time = index / audioContext.sampleRate;
        const envelope = Math.exp(-time * 34);
        const tone = Math.sin(2 * Math.PI * (state === 'filled' ? 180 : 145) * time) * 0.7;
        const noise = (Math.random() * 2 - 1) * 0.8;
        data[index] = (tone + noise) * envelope * level;
      }
      buffers[state] = buffer;
      return buffers;
    }, {});
    return drumBuffersRef.current;
  };
  /**
   * Dispara o som sintetizado de uma nota do modo "Notas" no instante agendado pelo Tone.js.
   * @param {'empty'|'filled'|'roll'} state Estado da nota.
   * @param {number} time Instante (relógio do AudioContext) em que o som deve soar.
   */
  const playDrumHit = (state, time) => {
    const audioContext = Tone.getContext().rawContext;
    const buffers = prepareDrumBuffers();
    const hitCount = state === 'roll' ? 3 : 1;
    for (let hitIndex = 0; hitIndex < hitCount; hitIndex += 1) {
      const source = audioContext.createBufferSource();
      source.buffer = buffers[state];
      source.connect(audioContext.destination);
      source.start(time + hitIndex * 0.028);
    }
  };
  /**
   * Gera (uma vez) e memoriza os buffers de áudio dos timbres de zabumba (preso, aberto, agudo).
   * @returns {{preso: AudioBuffer, aberto: AudioBuffer, agudo: AudioBuffer}}
   */
  const prepareZabumbaBuffers = () => {
    if (zabumbaBuffersRef.current) return zabumbaBuffersRef.current;
    const audioContext = Tone.getContext().rawContext;
    const specs = {
      preso: { frequency: 95, duration: 0.09, decay: 55, noise: 0.35 },
      aberto: { frequency: 88, duration: 0.34, decay: 14, noise: 0.3 },
      agudo: { frequency: 340, duration: 0.12, decay: 40, noise: 0.55 }
    };
    zabumbaBuffersRef.current = Object.entries(specs).reduce((buffers, [tone, spec]) => {
      const buffer = audioContext.createBuffer(1, Math.ceil(audioContext.sampleRate * spec.duration), audioContext.sampleRate);
      const data = buffer.getChannelData(0);
      for (let index = 0; index < data.length; index += 1) {
        const time = index / audioContext.sampleRate;
        const envelope = Math.exp(-time * spec.decay);
        const body = Math.sin(2 * Math.PI * spec.frequency * time);
        const noise = (Math.random() * 2 - 1) * spec.noise;
        data[index] = (body * (1 - spec.noise) + noise) * envelope;
      }
      buffers[tone] = buffer;
      return buffers;
    }, {});
    return zabumbaBuffersRef.current;
  };
  /**
   * Dispara o timbre de zabumba correspondente à sílaba lida, no instante agendado pelo Tone.js.
   * @param {'preso'|'aberto'|'agudo'} tone Timbre a tocar.
   * @param {number} time Instante (relógio do AudioContext) em que o som deve soar.
   */
  const playZabumbaHit = (tone, time) => {
    const audioContext = Tone.getContext().rawContext;
    const buffers = prepareZabumbaBuffers();
    const source = audioContext.createBufferSource();
    source.buffer = buffers[tone];
    source.connect(audioContext.destination);
    source.start(time);
  };
  /**
   * Atualiza o texto (som) de uma célula do solfejo numérico.
   * @param {number} cellIndex Índice da célula.
   * @param {'upper'|'lower'} key Linha alterada.
   * @param {string} value Novo valor (uma das sílabas permitidas).
   */
  const updateCell = (cellIndex, key, value) => onChange((current) => ({ ...current, cells: current.cells.map((cell, index) => index === cellIndex ? { ...cell, [key]: value } : cell) }));
  /** Confirma o valor digitado no campo de BPM, aplicando os limites de 30 a 240. */
  const commitBpm = () => {
    const bpm = Math.min(240, Math.max(30, Number(bpmInput) || 80));
    setBpmInput(String(bpm));
    onChange((current) => ({ ...current, bpm }));
  };
  /**
   * Atualiza o campo de BPM enquanto o usuário digita, aplicando o valor apenas se já for válido.
   * @param {string} value Valor bruto digitado no input.
   */
  const updateBpmInput = (value) => {
    setBpmInput(value);
    const bpm = Number(value);
    if (Number.isInteger(bpm) && bpm >= 30 && bpm <= 240) onChange((current) => ({ ...current, bpm }));
  };
  /** Interrompe a leitura em andamento (Tone.Transport, sequência agendada e narração por voz). */
  const stopPlayback = () => {
    toneSequenceRef.current?.dispose();
    toneSequenceRef.current = null;
    Tone.Transport.stop();
    Tone.Transport.cancel();
    stopSpeech();
    setActiveCellIndex(null);
    setIsPlaying(false);
    if (activePlaybackStop === stopPlayback) activePlaybackStop = null;
  };
  /**
   * Inicia a leitura sincronizada da frase: agenda cada célula em uma sequência do Tone.js no BPM
   * definido, disparando o timbre de zabumba/nota correspondente ou narrando por voz.
   */
  const startPlayback = async () => {
    activePlaybackStop?.();
    activePlaybackStop = stopPlayback;
    await Tone.start();
    window.speechSynthesis?.getVoices();
    Tone.Transport.bpm.value = phrase.bpm;
    const speechRate = Math.min(10, Math.max(2, phrase.bpm / 20));
    const playbackCells = phrase.noteMode ? phrase.noteCells.slice(0, phrase.beatCount * 4) : phrase.cells;
    const values = playbackCells.map((_, index) => index);
    // subdivisão de 16 avos, pois cada célula equivale a um tempo dividido em 4
    const sequence = new Tone.Sequence((time, index) => {
      const cell = playbackCells[index];
      Tone.Draw.schedule(() => setActiveCellIndex(index), time);
      if (phrase.noteMode) {
        playDrumHit(cell.state, time);
        return;
      }
      const zabumbaTones = zabumbaTonesForCell(cell);
      if (zabumbaTones.length > 0) {
        zabumbaTones.forEach((tone) => playZabumbaHit(tone, time));
        return;
      }
      const narration = narrationForCell(cell);
      Tone.Draw.schedule(() => {
        stopSpeech();
        if (narration) speak(narration, { lang: 'pt-BR', voiceURI: portugueseVoice?.voiceURI, rate: speechRate, volume: 1 });
      }, time);
    }, values, '16n').start(0);
    toneSequenceRef.current = sequence;
    Tone.Transport.start();
    setIsPlaying(true);
  };
  useEffect(() => stopPlayback, []);
  useEffect(() => { setBpmInput(String(phrase.bpm)); }, [phrase.bpm]);
  return <section className={`phrase${phrase.noteMode ? ' note-mode' : ''}`} style={style}>
    <div className="phrase-header">
      <select className="mode-select" value={phrase.noteMode ? 'notes' : 'numeric'} aria-label={`Modo da frase ${phraseIndex + 1}`} onChange={(event) => { const mode = event.target.value; onChange((current) => ({ ...current, noteMode: mode === 'notes' })); }}><option value="numeric">Solfejo numérico</option><option value="notes">Notas</option></select>
      <div className="phrase-title-wrap"><div className="phrase-title-row"><input className="phrase-title" value={phrase.title} type="text" placeholder={`Título da frase ${phraseIndex + 1}`} aria-label={`Título da frase ${phraseIndex + 1}`} onChange={(event) => { const title = event.target.value; onChange((current) => ({ ...current, title })); }} /><div className="phrase-playback-controls"><label className="playback-bpm"><span>BPM</span><input type="number" min="30" max="240" value={bpmInput} aria-label={`BPM da frase ${phraseIndex + 1}`} onChange={(event) => updateBpmInput(event.target.value)} onBlur={commitBpm} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} /></label><button className={`phrase-playback-button${isPlaying ? ' is-playing' : ''}`} type="button" title={isPlaying ? 'Parar leitura' : 'Ler frase'} aria-label={isPlaying ? `Parar frase ${phraseIndex + 1}` : `Ler frase ${phraseIndex + 1}`} onClick={isPlaying ? stopPlayback : startPlayback}><span aria-hidden="true">{isPlaying ? '■' : '▶'}</span></button></div></div><span className="print-phrase-title">{phrase.title || `Frase ${phraseIndex + 1}`}</span><div className="phrase-title-underline"></div></div>
      <div className="phrase-header-actions">
        <select className="beat-select" value={phrase.beatCount} aria-label={`Quantidade de tempos da frase ${phraseIndex + 1}`} onChange={(event) => { const beatCount = Number(event.target.value); onChange((current) => ({ ...current, beatCount, cells: createCells(beatCount, current.cells) })); }}>{Array.from({ length: 8 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1} {index ? 'tempos' : 'tempo'}</option>)}</select>
        <PaletteDialog phrase={phrase} phraseIndex={phraseIndex} onChange={(key, value) => onChange((current) => ({ ...current, palette: { ...current.palette, [key]: value } }))} />
        <button className="duplicate-phrase-button" type="button" title="Duplicar frase" aria-label={`Duplicar frase ${phraseIndex + 1}`} onClick={onDuplicate}>▣</button>
        <button className="add-to-group-button" type="button" title="Adicionar uma frase ao grupo" aria-label={`Adicionar uma frase ao grupo da frase ${phraseIndex + 1}`} onClick={onAddToGroup}>+</button>
        {phrase.groupId && <button className="ungroup-phrase-button" type="button" title="Retirar do grupo" aria-label={`Retirar frase ${phraseIndex + 1} do grupo`} onClick={onUngroup}>↗</button>}
        <button className="delete-phrase-button" type="button" title="Remover frase" aria-label={`Remover frase ${phraseIndex + 1}`} disabled={phraseCount === 1} onClick={onRemove}>×</button>
      </div>
    </div>
    {!phrase.noteMode && <div className="upper-hint">Linha superior (opcional)</div>}
    {phrase.noteMode ? <NoteNotation phrase={phrase} phraseIndex={phraseIndex} activeCellIndex={activeCellIndex} onNoteChange={(noteIndex) => onChange((current) => ({ ...current, noteCells: current.noteCells.map((note, index) => index === noteIndex ? { ...note, state: nextNoteState(note.state) } : note) }))} /> : <NumericNotation phrase={phrase} phraseIndex={phraseIndex} onCellChange={updateCell} activeCellIndex={activeCellIndex} />}
  </section>;
}

/**
 * Componente raiz: gerencia as páginas do caderno (cada uma com título e frases próprias),
 * persiste tudo no localStorage e renderiza a barra de abas, a folha ativa e suas frases/grupos.
 */
function App() {
  const initialPagesRef = useRef(null);
  if (initialPagesRef.current === null) initialPagesRef.current = loadPages();
  const [pages, setPages] = useState(() => initialPagesRef.current);
  const [activePageId, setActivePageId] = useState(() => {
    const stored = localStorage.getItem('solfejo-active-page');
    return initialPagesRef.current.find((page) => page.id === stored)?.id ?? initialPagesRef.current[0]?.id ?? null;
  });
  const importFileRef = useRef(null);

  useEffect(() => {
    localStorage.setItem('solfejo-pages', JSON.stringify(pages));
  }, [pages]);
  useEffect(() => {
    if (activePageId) localStorage.setItem('solfejo-active-page', activePageId);
  }, [activePageId]);
  // interrompe a leitura quando a aba/tela é ocultada (ex.: celular travado)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) activePlaybackStop?.();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  const activePage = pages.find((page) => page.id === activePageId) || pages[0];
  const activePageIndex = pages.findIndex((page) => page.id === activePage.id);
  const phrases = activePage.phrases;
  const setPhrases = (updater) => setPages((current) => current.map((page) => page.id === activePage.id ? { ...page, phrases: typeof updater === 'function' ? updater(page.phrases) : updater } : page));
  const setTitle = (title) => setPages((current) => current.map((page) => page.id === activePage.id ? { ...page, title } : page));

  /** Cria uma nova página em branco e a torna a página ativa. */
  const addPage = () => {
    const newPage = createPage('');
    setPages([...pages, newPage]);
    setActivePageId(newPage.id);
  };
  /**
   * Remove uma página após confirmação do usuário (ação destrutiva). Não remove a última página restante.
   * @param {string} pageId Identificador da página a remover.
   */
  const removePage = (pageId) => {
    if (pages.length === 1) return;
    const page = pages.find((item) => item.id === pageId);
    if (!window.confirm(`Remover "${page?.title || 'esta página'}"? Todas as frases dessa página serão perdidas.`)) return;
    const next = pages.filter((item) => item.id !== pageId);
    setPages(next);
    if (activePageId === pageId) setActivePageId(next[0].id);
  };
  /** Baixa a página ativa (título + frases) como um arquivo .json, para compartilhamento. */
  const exportPage = () => {
    const data = JSON.stringify({ title: activePage.title, phrases: activePage.phrases }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${(activePage.title || 'pagina').trim().toLowerCase().replace(/\s+/g, '-') || 'pagina'}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };
  /**
   * Lê um arquivo .json exportado por este app e adiciona seu conteúdo como uma nova página.
   * @param {import('react').ChangeEvent<HTMLInputElement>} event Evento do input de arquivo.
   */
  const importPage = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        const phrases = Array.isArray(data.phrases) && data.phrases.length ? data.phrases.map(normalizePhrase) : [createPhrase()];
        const newPage = { id: createPageId(), title: data.title || '', phrases };
        setPages((current) => [...current, newPage]);
        setActivePageId(newPage.id);
      } catch {
        window.alert('Arquivo inválido. Selecione um arquivo de página exportado por este app.');
      }
    };
    reader.readAsText(file);
  };

  /**
   * Aplica uma atualização a uma frase específica da página ativa.
   * @param {number} index Índice da frase.
   * @param {(phrase: object) => object} update Função que retorna a nova versão da frase.
   */
  const changePhrase = (index, update) => setPhrases((current) => updatePhrase(current, index, update));
  /**
   * Adiciona uma nova frase ao grupo da frase indicada, criando o grupo se ela ainda for independente.
   * @param {number} phraseIndex Índice da frase de referência.
   */
  const addPhraseToGroup = (phraseIndex) => setPhrases((current) => {
    const groupId = current[phraseIndex].groupId || createGroupId();
    const groupTitle = current[phraseIndex].groupTitle || 'Grupo de frases';
    const newPhrase = createPhrase(true);
    newPhrase.groupId = groupId;
    newPhrase.groupTitle = groupTitle;
    const updated = current.map((phrase, index) => index === phraseIndex ? { ...phrase, groupId, groupTitle } : phrase);
    return [...updated.slice(0, phraseIndex + 1), newPhrase, ...updated.slice(phraseIndex + 1)];
  });
  /**
   * Retira uma frase do seu grupo; se restar apenas uma no grupo, ele é desfeito automaticamente.
   * @param {number} phraseIndex Índice da frase.
   */
  const ungroupPhrase = (phraseIndex) => setPhrases((current) => releaseSingletonGroups(updatePhrase(current, phraseIndex, (phrase) => ({ ...phrase, groupId: null, groupTitle: '' }))));
  /**
   * Remove uma frase da página (nunca deixa a página vazia) e desfaz grupos que ficarem órfãos.
   * @param {number} phraseIndex Índice da frase a remover.
   */
  const removePhrase = (phraseIndex) => setPhrases((current) => current.length === 1 ? current : releaseSingletonGroups(current.filter((_, itemIndex) => itemIndex !== phraseIndex)));
  /**
   * Duplica uma frase, inserindo a cópia logo após a original (sempre fora de qualquer grupo).
   * @param {number} phraseIndex Índice da frase original.
   * @param {boolean} clearTitle Quando true, marca o título da cópia como "(cópia)".
   */
  const duplicatePhrase = (phraseIndex, clearTitle) => setPhrases((current) => {
    const copy = structuredClone(current[phraseIndex] || createPhrase(true));
    if (clearTitle) copy.title = copy.title ? `${copy.title} (cópia)` : '';
    copy.groupId = null;
    copy.groupTitle = '';
    return [...current.slice(0, phraseIndex + 1), copy, ...current.slice(phraseIndex + 1)];
  });

  const items = [];
  for (let index = 0; index < phrases.length;) {
    const phraseIndex = index;
    const phrase = phrases[phraseIndex];
    if (!phrase.groupId) {
      items.push(<Phrase key={`phrase-${phraseIndex}`} phrase={phrase} phraseIndex={phraseIndex} phraseCount={phrases.length} onChange={(update) => changePhrase(phraseIndex, update)} onAddToGroup={() => addPhraseToGroup(phraseIndex)} onDuplicate={() => duplicatePhrase(phraseIndex, true)} onRemove={() => removePhrase(phraseIndex)} onUngroup={() => ungroupPhrase(phraseIndex)} />);
      index += 1;
      continue;
    }
    const groupId = phrase.groupId;
    const group = [];
    while (index < phrases.length && phrases[index].groupId === groupId) { group.push({ phrase: phrases[index], index }); index += 1; }
    items.push(<section className="phrase-group" key={groupId}><div className="group-heading"><input className="group-title" value={group[0].phrase.groupTitle || 'Grupo de frases'} placeholder="Título do grupo" aria-label="Título do grupo de frases" onChange={(event) => { const groupTitle = event.target.value; setPhrases((current) => current.map((item) => item.groupId === groupId ? { ...item, groupTitle } : item)); }} /><span className="print-group-title">{group[0].phrase.groupTitle || 'Grupo de frases'}</span></div><div className="group-content">{group.map(({ phrase: groupedPhrase, index: groupedIndex }) => <Phrase key={`phrase-${groupedIndex}`} phrase={groupedPhrase} phraseIndex={groupedIndex} phraseCount={phrases.length} onChange={(update) => changePhrase(groupedIndex, update)} onAddToGroup={() => addPhraseToGroup(groupedIndex)} onDuplicate={() => duplicatePhrase(groupedIndex, false)} onRemove={() => removePhrase(groupedIndex)} onUngroup={() => ungroupPhrase(groupedIndex)} />)}</div></section>);
  }

  return <main className="app-shell">
    <header className="topbar"><div className="brand-mark" aria-hidden="true">♪</div><div><p className="eyebrow">Caderno de solfejo</p><h1>Caderninho de Estudos Musical</h1></div><div className="topbar-actions"><button className="button button-quiet" type="button" title="Exportar a página atual para um arquivo" onClick={exportPage}>Exportar página</button><button className="button button-quiet" type="button" title="Importar uma página de um arquivo exportado" onClick={() => importFileRef.current?.click()}>Importar página</button><input ref={importFileRef} type="file" accept="application/json" hidden onChange={importPage} /><button className="button button-dark" type="button" title="Abrir opções para salvar a folha em PDF" onClick={() => window.print()}>Salvar PDF</button></div></header>
    <div className="page-tabs" role="tablist" aria-label="Páginas do caderno">
      {pages.map((page, pageIndex) => <div className="page-tab-wrap" key={page.id}>
        <button className={`page-tab${page.id === activePage.id ? ' is-active' : ''}`} type="button" role="tab" aria-selected={page.id === activePage.id} onClick={() => setActivePageId(page.id)}>{page.title || `Página ${pageIndex + 1}`}</button>
        <button className="page-tab-delete" type="button" title="Remover página" aria-label={`Remover página ${page.title || pageIndex + 1}`} disabled={pages.length === 1} onClick={() => removePage(page.id)}>×</button>
      </div>)}
      <button className="page-tab-add" type="button" title="Adicionar uma nova página" aria-label="Adicionar uma nova página" onClick={addPage}>+ Nova página</button>
    </div>
    <section className="workspace" aria-label="Editor de solfejo">
      <section className="sheet-area"><div className="sheet-toolbar"><span><strong>{phrases.length}</strong>{phrases.length === 1 ? ' frase' : ' frases'}</span><div className="sheet-toolbar-actions"><button className="button button-accent" type="button" onClick={() => setPhrases((current) => [...current, createPhrase(true)])}>+ Nova frase</button><span className="status-dot">Alterações salvas no navegador</span></div></div><article className="music-sheet"><div className="sheet-title-wrap"><input className="sheet-title" value={activePage.title} type="text" placeholder={`Página ${activePageIndex + 1}`} aria-label="Título da folha" onChange={(event) => setTitle(event.target.value)} /><div className="title-underline"></div></div><div className="phrases" aria-label="Frases musicais">{items}</div></article></section>
    </section>
  </main>;
}

const rootElement = document.getElementById('root');
const appRoot = globalThis.__solfejoRoot || createRoot(rootElement);
globalThis.__solfejoRoot = appRoot;
appRoot.render(<App />);