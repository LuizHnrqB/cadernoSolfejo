import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useSpeak, useVoices } from 'react-text-to-speech';

const defaultPalette = { title: '#edf3f5', symbol: '#edf3f5', upper: '#f06d5e', lower: '#edf3f5' };
const legacyDefaultPalette = { title: '#111111', symbol: '#111111', upper: '#e92d3d', lower: '#111111' };
const defaultTexts = [
  { upper: '', lower: 'Tu' }, { upper: 'Tchã\n(opc)', lower: '' }, { upper: '', lower: '' }, { upper: '', lower: '' },
  { upper: '', lower: 'Tum' }, { upper: '', lower: '' }, { upper: 'Tchã', lower: '' }, { upper: '', lower: '' },
  { upper: '', lower: 'Tu' }, { upper: '', lower: '' }, { upper: 'Tchã', lower: '' }, { upper: '', lower: '' },
  { upper: '', lower: 'Tum' }, { upper: '', lower: '' }, { upper: 'Tchã', lower: '' }, { upper: '', lower: '' }
];

function numericSymbol(index) {
  const position = index % 4;
  return position === 0 ? String(Math.floor(index / 4) + 1) : position === 2 ? '•' : '-';
}

function createCells(beatCount, savedCells = []) {
  return Array.from({ length: beatCount * 4 }, (_, index) => ({
    symbol: numericSymbol(index),
    noteState: ['empty', 'filled', 'roll'].includes(savedCells[index]?.noteState) ? savedCells[index].noteState : 'empty',
    upper: savedCells[index]?.upper ?? defaultTexts[index % defaultTexts.length].upper,
    lower: savedCells[index]?.lower ?? defaultTexts[index % defaultTexts.length].lower
  }));
}

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

function normalizePhrase(saved) {
  const legacy = Array.isArray(saved);
  const beatCount = Math.min(8, Math.max(1, Number(saved.beatCount) || 4));
  const cells = legacy ? saved : saved.cells;
  const savedPalette = legacy ? {} : saved.palette || {};
  const palette = Object.fromEntries(Object.entries(defaultPalette).map(([key, value]) => [key, savedPalette[key] === legacyDefaultPalette[key] ? value : savedPalette[key] || value]));
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

function loadPhrases() {
  try {
    const saved = JSON.parse(localStorage.getItem('solfejo-phrases') || 'null');
    return saved?.length ? saved.map(normalizePhrase) : [createPhrase()];
  } catch {
    return [createPhrase()];
  }
}

function nextNoteState(state) {
  const states = ['empty', 'filled', 'roll'];
  return states[(states.indexOf(state) + 1) % states.length];
}

function narrationForCell(cell) {
  return cell.lower.trim();
}

function narrationForNote(note) {
  return { filled: 'Pá', empty: 'ti', roll: 'tirr' }[note.state];
}

function createGroupId() {
  return `group-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function updatePhrase(phrases, phraseIndex, update) {
  return phrases.map((phrase, index) => index === phraseIndex ? update(phrase) : phrase);
}

let activePlaybackStop = null;

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

function NumericNotation({ phrase, phraseIndex, onCellChange }) {
  return <div className="notation" aria-label={`Linha da frase ${phraseIndex + 1}`} style={{ '--phrase-columns': phrase.cells.length, '--symbol-size': `${Math.max(24, Math.min(68, 1080 / phrase.cells.length))}px` }}>
    {phrase.cells.map((cell, cellIndex) => <div className="notation-cell" key={cellIndex}>
      <div className="text-field-wrap upper-field"><textarea wrap="off" className={`cell-input upper${cell.upper.trim() ? ' has-content' : ''}`} value={cell.upper} aria-label={`Texto acima da marcação ${cellIndex + 1} da frase ${phraseIndex + 1}`} onChange={(event) => onCellChange(cellIndex, 'upper', event.target.value)} /><span className="print-text upper">{cell.upper}</span></div>
      <div className="symbol-wrap"><span className="symbol dash-symbol" aria-label={`Marcação fixa ${cell.symbol}`}>{cell.symbol}</span></div>
      <div className="text-field-wrap lower-field"><textarea wrap="off" className={`cell-input lower${cell.lower.trim() ? ' has-content' : ''}`} value={cell.lower} aria-label={`Texto abaixo da marcação ${cellIndex + 1} da frase ${phraseIndex + 1}`} onChange={(event) => onCellChange(cellIndex, 'lower', event.target.value)} /><span className="print-text lower">{cell.lower}</span></div>
    </div>)}
  </div>;
}

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

function Phrase({ phrase, phraseIndex, selected, phraseCount, onChange, onSelect, onDuplicate, onRemove, onUngroup }) {
  const style = { '--phrase-bg': `color-mix(in srgb, ${phraseIndex % 2 === 0 ? 'var(--blue)' : 'var(--cream)'} 16%, #fffdf4)`, '--phrase-title': phrase.palette.title, '--symbol': phrase.palette.symbol, '--upper': phrase.palette.upper, '--lower': phrase.palette.lower };
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeCellIndex, setActiveCellIndex] = useState(null);
  const [bpmInput, setBpmInput] = useState(String(phrase.bpm));
  const playbackTimers = useRef([]);
  const playbackSession = useRef(0);
  const audioContextRef = useRef(null);
  const noiseBufferRef = useRef(null);
  const drumBuffersRef = useRef(null);
  const audioSourcesRef = useRef([]);
  const pendingSpeechRef = useRef(null);
  const speechStartActionRef = useRef(null);
  const { speak, stop: stopSpeech } = useSpeak({
    preserveUtteranceQueue: false,
    onStart: () => {
      const pendingSpeech = pendingSpeechRef.current;
      if (pendingSpeech && pendingSpeech.session === playbackSession.current) setActiveCellIndex(pendingSpeech.cellIndex);
      pendingSpeechRef.current = null;
      const speechStartAction = speechStartActionRef.current;
      speechStartActionRef.current = null;
      speechStartAction?.();
    }
  });
  const { voices } = useVoices();
  const portugueseVoices = voices.filter((voice) => voice.lang.toLowerCase() === 'pt-br');
  const portugueseVoice = portugueseVoices.find((voice) => /maria|female|feminina/i.test(voice.name)) || portugueseVoices[0];
  const getAudioContext = async () => {
    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextConstructor) return null;
    if (!audioContextRef.current) audioContextRef.current = new AudioContextConstructor();
    await audioContextRef.current.resume();
    return audioContextRef.current;
  };
  const prepareWarDrum = async () => {
    const audioContext = await getAudioContext();
    if (!audioContext) return;
    if (!noiseBufferRef.current) {
      const noiseBuffer = audioContext.createBuffer(1, audioContext.sampleRate * 0.2, audioContext.sampleRate);
      const noiseData = noiseBuffer.getChannelData(0);
      for (let index = 0; index < noiseData.length; index += 1) noiseData[index] = Math.random() * 2 - 1;
      noiseBufferRef.current = noiseBuffer;
    }
    if (!drumBuffersRef.current) {
      drumBuffersRef.current = ['empty', 'filled', 'roll'].reduce((buffers, state) => {
        const duration = state === 'roll' ? 0.095 : 0.13;
        const buffer = audioContext.createBuffer(1, Math.ceil(audioContext.sampleRate * duration), audioContext.sampleRate);
        const data = buffer.getChannelData(0);
        const level = state === 'filled' ? 0.72 : state === 'roll' ? 0.58 : 0.46;
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
    }
    return audioContext;
  };
  const createPhraseBuffer = (audioContext, cells, cellDuration) => {
    const sampleRate = audioContext.sampleRate;
    const cellSamples = Math.round(cellDuration * sampleRate / 1000);
    const phraseBuffer = audioContext.createBuffer(1, cellSamples * cells.length, sampleRate);
    const phraseData = phraseBuffer.getChannelData(0);
    cells.forEach((cell, cellIndex) => {
      const noteBuffer = drumBuffersRef.current[cell.state];
      const noteData = noteBuffer.getChannelData(0);
      const hitCount = cell.state === 'roll' ? 3 : 1;
      for (let hitIndex = 0; hitIndex < hitCount; hitIndex += 1) {
        const targetStart = cellIndex * cellSamples + Math.round(hitIndex * 0.028 * sampleRate);
        for (let sampleIndex = 0; sampleIndex < noteData.length && targetStart + sampleIndex < phraseData.length; sampleIndex += 1) {
          phraseData[targetStart + sampleIndex] += noteData[sampleIndex];
        }
      }
    });
    return phraseBuffer;
  };
  const updateCell = (cellIndex, key, value) => onChange((current) => ({ ...current, cells: current.cells.map((cell, index) => index === cellIndex ? { ...cell, [key]: value } : cell) }));
  const commitBpm = () => {
    const bpm = Math.min(240, Math.max(30, Number(bpmInput) || 80));
    setBpmInput(String(bpm));
    onChange((current) => ({ ...current, bpm }));
  };
  const updateBpmInput = (value) => {
    setBpmInput(value);
    const bpm = Number(value);
    if (Number.isInteger(bpm) && bpm >= 30 && bpm <= 240) onChange((current) => ({ ...current, bpm }));
  };
  const stopPlayback = () => {
    playbackSession.current += 1;
    playbackTimers.current.forEach((timer) => window.clearTimeout(timer));
    playbackTimers.current = [];
    audioSourcesRef.current.forEach((source) => {
      try { source.stop(); } catch {}
    });
    audioSourcesRef.current = [];
    pendingSpeechRef.current = null;
    speechStartActionRef.current = null;
    stopSpeech();
    setActiveCellIndex(null);
    setIsPlaying(false);
    if (activePlaybackStop === stopPlayback) activePlaybackStop = null;
  };
  const startPlayback = () => {
    activePlaybackStop?.();
    activePlaybackStop = stopPlayback;
    window.speechSynthesis?.getVoices();
    const cellDuration = 60000 / phrase.bpm / 4;
    const speechRate = Math.min(10, Math.max(2, phrase.bpm / 20));
    const playbackCells = phrase.noteMode ? phrase.noteCells.slice(0, phrase.beatCount * 4) : phrase.cells;
    const session = playbackSession.current;
    let cellIndex = 0;
    setIsPlaying(true);
    if (phrase.noteMode) {
      prepareWarDrum().then((audioContext) => {
        if (!audioContext || playbackSession.current !== session) return;
        const phraseBuffer = createPhraseBuffer(audioContext, playbackCells, cellDuration);
        const scheduleNoteCycle = () => {
        if (playbackSession.current !== session) return;
        const cycleStart = audioContext.currentTime + 0.05;
        const source = audioContext.createBufferSource();
        source.buffer = phraseBuffer;
        source.connect(audioContext.destination);
        source.start(cycleStart);
        source.onended = () => { audioSourcesRef.current = audioSourcesRef.current.filter((item) => item !== source); };
        audioSourcesRef.current.push(source);
        playbackCells.forEach((cell, index) => {
          const offset = index * cellDuration;
          const highlightTimer = window.setTimeout(() => {
            if (playbackSession.current === session) setActiveCellIndex(index);
          }, Math.max(0, (cycleStart - audioContext.currentTime) * 1000 + offset));
          playbackTimers.current.push(highlightTimer);
        });
        const phraseDuration = playbackCells.length * cellDuration;
        const nextCycleDelay = Math.max(0, (cycleStart - audioContext.currentTime) * 1000 + phraseDuration - 50);
        const cycleTimer = window.setTimeout(scheduleNoteCycle, nextCycleDelay);
        playbackTimers.current.push(cycleTimer);
      };
      scheduleNoteCycle();
      });
      return;
    }
    const playCell = () => {
      if (playbackSession.current !== session) return;
      const cell = playbackCells[cellIndex];
      const narration = narrationForCell(cell);
      if (narration) {
        stopSpeech();
        pendingSpeechRef.current = { session, cellIndex };
        speechStartActionRef.current = () => {
          if (playbackSession.current !== session) return;
          cellIndex = (cellIndex + 1) % playbackCells.length;
          playbackTimers.current = [window.setTimeout(playCell, cellDuration)];
        };
        speak(narration, { lang: 'pt-BR', voiceURI: portugueseVoice?.voiceURI, rate: speechRate, volume: 1 });
      } else {
        setActiveCellIndex(cellIndex);
        cellIndex = (cellIndex + 1) % playbackCells.length;
        playbackTimers.current = [window.setTimeout(playCell, cellDuration)];
      }
    };
    playCell();
  };
  useEffect(() => () => {
    playbackTimers.current.forEach((timer) => window.clearTimeout(timer));
    stopSpeech();
  }, []);
  useEffect(() => { setBpmInput(String(phrase.bpm)); }, [phrase.bpm]);
  return <section className={`phrase${phrase.noteMode ? ' note-mode' : ''}`} style={style}>
    <div className="phrase-header">
      <label className="phrase-selection" title="Selecionar frase para agrupar"><input type="checkbox" checked={selected} onChange={(event) => onSelect(event.target.checked)} aria-label={`Selecionar frase ${phraseIndex + 1}`} /></label>
      <select className="mode-select" value={phrase.noteMode ? 'notes' : 'numeric'} aria-label={`Modo da frase ${phraseIndex + 1}`} onChange={(event) => { const mode = event.target.value; onChange((current) => ({ ...current, noteMode: mode === 'notes' })); }}><option value="numeric">Solfejo numérico</option><option value="notes">Notas</option></select>
      <div className="phrase-title-wrap"><div className="phrase-title-row"><input className="phrase-title" value={phrase.title} type="text" placeholder={`Título da frase ${phraseIndex + 1}`} aria-label={`Título da frase ${phraseIndex + 1}`} onChange={(event) => { const title = event.target.value; onChange((current) => ({ ...current, title })); }} /><div className="phrase-playback-controls"><label className="playback-bpm"><span>BPM</span><input type="number" min="30" max="240" value={bpmInput} aria-label={`BPM da frase ${phraseIndex + 1}`} onChange={(event) => updateBpmInput(event.target.value)} onBlur={commitBpm} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} /></label><button className={`phrase-playback-button${isPlaying ? ' is-playing' : ''}`} type="button" title={isPlaying ? 'Parar leitura' : 'Ler frase'} aria-label={isPlaying ? `Parar frase ${phraseIndex + 1}` : `Ler frase ${phraseIndex + 1}`} onClick={isPlaying ? stopPlayback : startPlayback}><span aria-hidden="true">{isPlaying ? '■' : '▶'}</span></button></div></div><span className="print-phrase-title">{phrase.title || `Frase ${phraseIndex + 1}`}</span><div className="phrase-title-underline"></div></div>
      <div className="phrase-header-actions">
        <select className="beat-select" value={phrase.beatCount} aria-label={`Quantidade de tempos da frase ${phraseIndex + 1}`} onChange={(event) => { const beatCount = Number(event.target.value); onChange((current) => ({ ...current, beatCount, cells: createCells(beatCount, current.cells) })); }}>{Array.from({ length: 8 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1} {index ? 'tempos' : 'tempo'}</option>)}</select>
        <PaletteDialog phrase={phrase} phraseIndex={phraseIndex} onChange={(key, value) => onChange((current) => ({ ...current, palette: { ...current.palette, [key]: value } }))} />
        <button className="duplicate-phrase-button" type="button" title="Duplicar frase" aria-label={`Duplicar frase ${phraseIndex + 1}`} onClick={onDuplicate}>▣</button>
        {phrase.groupId && <button className="ungroup-phrase-button" type="button" title="Retirar do grupo" aria-label={`Retirar frase ${phraseIndex + 1} do grupo`} onClick={onUngroup}>↗</button>}
        <button className="delete-phrase-button" type="button" title="Remover frase" aria-label={`Remover frase ${phraseIndex + 1}`} disabled={phraseCount === 1} onClick={onRemove}>×</button>
      </div>
    </div>
    {!phrase.noteMode && <div className="upper-hint">Linha superior (opcional)</div>}
    {phrase.noteMode ? <NoteNotation phrase={phrase} phraseIndex={phraseIndex} activeCellIndex={activeCellIndex} onNoteChange={(noteIndex) => onChange((current) => ({ ...current, noteCells: current.noteCells.map((note, index) => index === noteIndex ? { ...note, state: nextNoteState(note.state) } : note) }))} /> : <NumericNotation phrase={phrase} phraseIndex={phraseIndex} onCellChange={updateCell} activeCellIndex={activeCellIndex} />}
  </section>;
}

function App() {
  const [title, setTitle] = useState(() => localStorage.getItem('solfejo-title') || 'Xote');
  const [phrases, setPhrases] = useState(() => loadPhrases());
  const [selected, setSelected] = useState(new Set());
  const hasMounted = useRef(false);

  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      return;
    }
    localStorage.setItem('solfejo-title', title);
    localStorage.setItem('solfejo-phrases', JSON.stringify(phrases));
  }, [title, phrases]);

  const changePhrase = (index, update) => setPhrases((current) => updatePhrase(current, index, update));
  const groupSelected = () => {
    const indexes = [...selected].sort((first, second) => first - second);
    if (indexes.length < 2) return;
    const groupId = phrases[indexes[0]].groupId || createGroupId();
    setPhrases((current) => current.map((phrase, index) => indexes.includes(index) ? { ...phrase, groupId, groupTitle: 'Grupo de frases' } : phrase));
    setSelected(new Set());
  };
  const items = [];
  for (let index = 0; index < phrases.length;) {
    const phraseIndex = index;
    const phrase = phrases[phraseIndex];
    if (!phrase.groupId) {
      items.push(<Phrase key={`phrase-${phraseIndex}`} phrase={phrase} phraseIndex={phraseIndex} selected={selected.has(phraseIndex)} phraseCount={phrases.length} onChange={(update) => changePhrase(phraseIndex, update)} onSelect={(checked) => setSelected((current) => { const next = new Set(current); checked ? next.add(phraseIndex) : next.delete(phraseIndex); return next; })} onDuplicate={() => setPhrases((current) => { const copy = structuredClone(current[phraseIndex] || createPhrase(true)); copy.title = copy.title ? `${copy.title} (cópia)` : ''; copy.groupId = null; copy.groupTitle = ''; return [...current.slice(0, phraseIndex + 1), copy, ...current.slice(phraseIndex + 1)]; })} onRemove={() => setPhrases((current) => current.length === 1 ? current : current.filter((_, itemIndex) => itemIndex !== phraseIndex))} onUngroup={() => changePhrase(phraseIndex, (current) => ({ ...current, groupId: null, groupTitle: '' }))} />);
      index += 1;
      continue;
    }
    const groupId = phrase.groupId;
    const group = [];
    while (index < phrases.length && phrases[index].groupId === groupId) { group.push({ phrase: phrases[index], index }); index += 1; }
    items.push(<section className="phrase-group" key={groupId}><div className="group-heading"><input className="group-title" value={group[0].phrase.groupTitle || 'Grupo de frases'} placeholder="Título do grupo" aria-label="Título do grupo de frases" onChange={(event) => { const groupTitle = event.target.value; setPhrases((current) => current.map((item) => item.groupId === groupId ? { ...item, groupTitle } : item)); }} /><span className="print-group-title">{group[0].phrase.groupTitle || 'Grupo de frases'}</span></div><div className="group-content">{group.map(({ phrase: groupedPhrase, index: groupedIndex }) => <Phrase key={`phrase-${groupedIndex}`} phrase={groupedPhrase} phraseIndex={groupedIndex} selected={selected.has(groupedIndex)} phraseCount={phrases.length} onChange={(update) => changePhrase(groupedIndex, update)} onSelect={(checked) => setSelected((current) => { const next = new Set(current); checked ? next.add(groupedIndex) : next.delete(groupedIndex); return next; })} onDuplicate={() => setPhrases((current) => { const copy = structuredClone(current[groupedIndex] || createPhrase(true)); copy.groupId = null; copy.groupTitle = ''; return [...current.slice(0, groupedIndex + 1), copy, ...current.slice(groupedIndex + 1)]; })} onRemove={() => setPhrases((current) => current.length === 1 ? current : current.filter((_, itemIndex) => itemIndex !== groupedIndex))} onUngroup={() => changePhrase(groupedIndex, (current) => ({ ...current, groupId: null, groupTitle: '' }))} />)}</div></section>);
  }

  return <main className="app-shell">
    <header className="topbar"><div className="brand-mark" aria-hidden="true">♪</div><div><p className="eyebrow">Caderno de solfejo</p><h1>Caderninho de Estudos Musical</h1></div><div className="topbar-actions"><button className="button button-accent" type="button" onClick={() => setPhrases((current) => [...current, createPhrase(true)])}>+ Nova frase</button><button className="button button-dark" type="button" title="Abrir opções para salvar a folha em PDF" onClick={() => window.print()}>Salvar PDF</button></div></header>
    <section className="workspace" aria-label="Editor de solfejo">
      <section className="sheet-area"><div className="sheet-toolbar"><span><strong>{phrases.length}</strong>{phrases.length === 1 ? ' frase' : ' frases'}</span>{selected.size >= 2 && <button className="button button-accent group-selected-button" type="button" onClick={groupSelected}>Agrupar selecionadas</button>}<span className="status-dot">Alterações salvas no navegador</span></div><article className="music-sheet"><div className="sheet-title-wrap"><input className="sheet-title" value={title} type="text" aria-label="Título da folha" onChange={(event) => setTitle(event.target.value)} /><div className="title-underline"></div></div><div className="phrases" aria-label="Frases musicais">{items}</div></article></section>
    </section>
  </main>;
}

const rootElement = document.getElementById('root');
const appRoot = globalThis.__solfejoRoot || createRoot(rootElement);
globalThis.__solfejoRoot = appRoot;
appRoot.render(<App />);