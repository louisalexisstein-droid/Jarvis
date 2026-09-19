import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import * as pdfjsLib from 'pdfjs-dist';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import './styles.css';
import { registerPWA } from './pwa';
import { hasSupabaseConfig, supabase } from './lib_supabase';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).toString();

const LEVELS = ['À revoir', 'Facile', 'Maîtrisé'];

function initials(email = '') {
  return email.split('@')[0].slice(0, 2).toUpperCase() || 'PA';
}

function AuthScreen() {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMessage(data.session ? 'Compte créé. Tu es connecté.' : 'Compte créé. Vérifie ton e-mail pour confirmer ton compte.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (error) {
      setMessage(error.message || 'Erreur de connexion.');
    } finally {
      setBusy(false);
    }
  }

  return <div className="auth-page">
    <div className="auth-card">
      <div className="brand auth-brand"><span className="logo">P</span><div><strong>Prépa AI</strong><small>Ton espace de révision</small></div></div>
      <span className="tag">Synchronisé partout</span>
      <h1>{mode === 'login' ? 'Connexion' : 'Créer ton compte'}</h1>
      <p className="auth-sub">Retrouve tes cours, flashcards et ta progression sur PC et téléphone.</p>
      <form onSubmit={submit} className="auth-form">
        <label>E-mail<input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="toi@email.com" required /></label>
        <label>Mot de passe<input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="6 caractères minimum" minLength={6} required /></label>
        {message && <div className="notice">{message}</div>}
        <button className="primary full" disabled={busy}>{busy ? 'Connexion…' : mode === 'login' ? 'Se connecter' : 'Créer mon compte'}</button>
      </form>
      <button className="link-button" onClick={() => { setMode(m => m === 'login' ? 'signup' : 'login'); setMessage(''); }}>
        {mode === 'login' ? 'Pas encore de compte ? Créer un compte' : 'J’ai déjà un compte'}
      </button>
    </div>
  </div>;
}

function MissingConfig() {
  return <div className="auth-page"><div className="auth-card">
    <div className="brand auth-brand"><span className="logo">P</span><div><strong>Prépa AI</strong><small>Configuration nécessaire</small></div></div>
    <span className="tag">Supabase</span>
    <h1>Il manque la connexion à la base de données</h1>
    <p className="auth-sub">La V2 utilise Supabase pour synchroniser tes cours et flashcards entre appareils.</p>
    <div className="setup-steps"><b>1.</b><span>Crée un projet Supabase.</span><b>2.</b><span>Exécute <code>supabase/schema.sql</code> dans le SQL Editor.</span><b>3.</b><span>Ajoute <code>VITE_SUPABASE_URL</code> et <code>VITE_SUPABASE_ANON_KEY</code> dans le fichier <code>.env</code> du client.</span><b>4.</b><span>Relance <code>npm run dev</code>.</span></div>
  </div></div>;
}

function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [tab, setTab] = useState('home');
  const [decks, setDecks] = useState([]);
  const [cards, setCards] = useState([]);
  const [courses, setCourses] = useState([]);
  const [activeDeck, setActiveDeck] = useState(null);
  const [studyIndex, setStudyIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [courseText, setCourseText] = useState('');
  const [courseTitle, setCourseTitle] = useState('');
  const [currentCourseId, setCurrentCourseId] = useState(null);
  const [isLoadingAI, setIsLoadingAI] = useState(false);
  const [chat, setChat] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [status, setStatus] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [showInstallHelp, setShowInstallHelp] = useState(false);

  useEffect(() => {
    registerPWA();
    const handler = (event) => { event.preventDefault(); setInstallPrompt(event); };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  useEffect(() => {
    if (!hasSupabaseConfig) { setAuthLoading(false); return; }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user) {
      setDecks([]); setCards([]); setCourses([]); return;
    }
    loadCloudData();
  }, [session?.user?.id]);

  async function loadCloudData() {
    setSyncing(true);
    setStatus('Synchronisation…');
    try {
      const [{ data: remoteDecks, error: decksError }, { data: remoteCards, error: cardsError }, { data: remoteCourses, error: coursesError }] = await Promise.all([
        supabase.from('decks').select('*').order('created_at', { ascending: false }),
        supabase.from('cards').select('*').order('created_at', { ascending: true }),
        supabase.from('courses').select('*').order('created_at', { ascending: false })
      ]);
      if (decksError) throw decksError;
      if (cardsError) throw cardsError;
      if (coursesError) throw coursesError;
      setDecks(remoteDecks || []);
      setCards(remoteCards || []);
      setCourses(remoteCourses || []);
      const latestCourse = (remoteCourses || [])[0];
      if (latestCourse) {
        setCurrentCourseId(latestCourse.id);
        setCourseTitle(latestCourse.title);
        setCourseText(latestCourse.text);
      }
      setStatus('Synchronisé');
    } catch (error) {
      setStatus(`Synchronisation impossible : ${error.message}`);
    } finally {
      setSyncing(false);
    }
  }

  const deckViews = useMemo(() => decks.map(d => {
    const deckCards = cards.filter(c => c.deck_id === d.id);
    return { ...d, count: deckCards.length, mastered: deckCards.filter(c => c.level === 'Maîtrisé').length };
  }), [decks, cards]);

  const dueCards = cards.filter(c => c.level !== 'Maîtrisé').slice(0, 10);
  const progress = Math.round((cards.filter(c => c.level === 'Maîtrisé').length / Math.max(cards.length, 1)) * 100);
  const currentStudyCards = useMemo(() => activeDeck ? cards.filter(c => c.deck_id === activeDeck) : dueCards, [activeDeck, cards, dueCards]);
  const currentCard = currentStudyCards[studyIndex % Math.max(currentStudyCards.length, 1)];

  function openStudy(deckId = null) {
    setActiveDeck(deckId); setStudyIndex(0); setShowAnswer(false); setTab('study');
  }

  async function rateCard(level) {
    if (!currentCard || !session?.user) return;
    setShowAnswer(false);
    setStudyIndex(i => i + 1);
    setCards(prev => prev.map(c => c.id === currentCard.id ? { ...c, level } : c));
    const { error } = await supabase.from('cards').update({ level }).eq('id', currentCard.id).eq('user_id', session.user.id);
    if (error) setStatus(`Erreur de synchronisation : ${error.message}`);
  }

  async function extractPdf(file) {
    setStatus('Lecture du PDF…');
    const buffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    let text = '';
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      text += content.items.map(i => i.str).join(' ') + '\n';
    }
    setCourseText(text.trim());
    setCourseTitle(file.name.replace(/\.[^.]+$/, ''));
    setCurrentCourseId(null);
    setStatus(`PDF chargé : ${pdf.numPages} page(s).`);
  }

  async function saveCourse() {
    if (!courseText.trim() || !session?.user) return setStatus('Ajoute d’abord le contenu du cours.');
    setSyncing(true);
    try {
      if (currentCourseId) {
        const { data, error } = await supabase.from('courses').update({ title: courseTitle || 'Nouveau cours', text: courseText }).eq('id', currentCourseId).select().single();
        if (error) throw error;
        setCourses(prev => prev.map(c => c.id === data.id ? data : c));
      } else {
        const { data, error } = await supabase.from('courses').insert({ user_id: session.user.id, title: courseTitle || 'Nouveau cours', text: courseText }).select().single();
        if (error) throw error;
        setCurrentCourseId(data.id);
        setCourses(prev => [data, ...prev]);
      }
      setStatus('Cours enregistré dans le cloud.');
    } catch (error) {
      setStatus(error.message);
    } finally { setSyncing(false); }
  }

  async function generateFlashcards() {
    if (!courseText.trim()) return setStatus('Ajoute d’abord un texte ou un PDF.');
    if (!session?.access_token) return setStatus('Connecte-toi pour utiliser l’IA.');
    setIsLoadingAI(true); setStatus('L’IA génère les cartes…');
    try {
      let courseId = currentCourseId;
      if (!courseId) {
        const { data: course, error: courseError } = await supabase.from('courses').insert({ user_id: session.user.id, title: courseTitle || 'Nouveau cours', text: courseText }).select().single();
        if (courseError) throw courseError;
        courseId = course.id; setCurrentCourseId(course.id); setCourses(prev => [course, ...prev]);
      } else {
        const { error } = await supabase.from('courses').update({ title: courseTitle || 'Nouveau cours', text: courseText }).eq('id', courseId);
        if (error) throw error;
      }

      const res = await fetch('http://localhost:3001/api/flashcards', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ title: courseTitle || 'Nouveau cours', text: courseText })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur IA');
      if (!Array.isArray(data.cards) || !data.cards.length) throw new Error('L’IA n’a renvoyé aucune carte.');

      const { data: deck, error: deckError } = await supabase.from('decks').insert({ user_id: session.user.id, course_id: courseId, name: courseTitle || 'Nouveau cours', subject: 'Nouveau' }).select().single();
      if (deckError) throw deckError;
      const rows = data.cards.map(c => ({ user_id: session.user.id, deck_id: deck.id, question: c.question, answer: c.answer, level: 'À revoir' }));
      const { data: newCards, error: cardError } = await supabase.from('cards').insert(rows).select();
      if (cardError) throw cardError;
      setDecks(prev => [deck, ...prev]); setCards(prev => [...prev, ...(newCards || [])]);
      setCourseText(''); setStatus(`${rows.length} cartes créées et synchronisées.`); openStudy(deck.id);
    } catch (error) {
      setStatus(error.message);
    } finally { setIsLoadingAI(false); }
  }

  async function askAI() {
    if (!chatInput.trim() || !session?.access_token) return;
    const question = chatInput.trim();
    const historyBefore = chat.slice(-8);
    setChat(c => [...c, { role: 'user', text: question }]); setChatInput(''); setIsLoadingAI(true);
    try {
      const res = await fetch('http://localhost:3001/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ question, courseText, history: historyBefore })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur IA');
      setChat(c => [...c, { role: 'assistant', text: data.answer }]);
    } catch (e) {
      setChat(c => [...c, { role: 'assistant', text: `Erreur : ${e.message}` }]);
    } finally { setIsLoadingAI(false); }
  }

  async function installApp() {
    if (!installPrompt) { setShowInstallHelp(true); return; }
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  }

  function selectCourse(course) {
    setCurrentCourseId(course.id); setCourseTitle(course.title); setCourseText(course.text); setStatus('Cours chargé depuis le cloud.');
  }

  if (authLoading) return <div className="loading-screen">Chargement de Prépa AI…</div>;
  if (!hasSupabaseConfig) return <MissingConfig />;
  if (!session) return <AuthScreen />;

  return <div className="app">
    <aside className="sidebar">
      <div className="brand"><span className="logo">P</span><div><strong>Prépa AI</strong><small>Assistant de révision</small></div></div>
      <nav>{[['home','⌂','Accueil'],['courses','▤','Cours'],['study','◉','Révisions'],['ai','✦','Assistant IA']].map(([id, icon, label]) => <button key={id} className={tab === id ? 'nav active' : 'nav'} onClick={() => setTab(id)}><span>{icon}</span>{label}</button>)}</nav>
      <div className="side-note"><b>Objectif du jour</b><span>{dueCards.length} cartes à revoir</span><div className="mini-bar"><i style={{ width: `${Math.min(100, progress)}%` }} /></div><small>{syncing ? 'Synchronisation…' : 'Synchronisé'}</small></div>
      <button className="install-side" onClick={installApp}>⬇ Installer sur le téléphone</button>
      <button className="logout-side" onClick={() => supabase.auth.signOut()}>Se déconnecter</button>
    </aside>

    <main>
      <header className="topbar"><div><p className="eyebrow">Espace synchronisé</p><h1>{tab === 'home' ? 'Bonjour 👋' : tab === 'courses' ? 'Mes cours' : tab === 'study' ? 'Révisions' : 'Assistant IA'}</h1></div><button className="avatar" title={session.user.email} onClick={() => supabase.auth.signOut()}>{initials(session.user.email)}</button></header>

      {tab === 'home' && <>
        <section className="hero-grid">
          <div className="hero-card"><span className="tag">Révision du jour</span><h2>Tu as {dueCards.length} cartes prioritaires.</h2><p>Commence par les notions que tu risques le plus d’oublier.</p><button className="primary" onClick={() => openStudy()}>Commencer →</button></div>
          <div className="stat-card"><span>Ma progression</span><strong>{progress}%</strong><div className="progress"><i style={{ width: `${progress}%` }} /></div><small>{cards.filter(c => c.level === 'Maîtrisé').length} / {cards.length} cartes maîtrisées</small></div>
        </section>
        <section className="section"><div className="section-head"><h2>Mes matières</h2><button className="ghost" onClick={() => setTab('courses')}>Voir tout</button></div><div className="deck-grid">{deckViews.map(d => <div className="deck" key={d.id} onClick={() => openStudy(d.id)}><span className="subject">{d.subject}</span><h3>{d.name}</h3><p>{d.mastered}/{d.count} maîtrisées</p><div className="progress"><i style={{ width: `${Math.round(d.mastered / Math.max(d.count, 1) * 100)}%` }} /></div></div>)}</div></section>
      </>}

      {tab === 'courses' && <section className="section">
        <div className="import-box"><div><span className="tag">Nouveau cours</span><h2>Transforme ton cours en cartes</h2><p>Colle ton cours ou importe un PDF. Il sera sauvegardé dans ton espace.</p></div><label className="upload">Importer un PDF<input type="file" accept="application/pdf,.txt" hidden onChange={async e => { const f = e.target.files?.[0]; if (!f) return; if (f.type === 'application/pdf') await extractPdf(f); else { setCourseText(await f.text()); setCourseTitle(f.name); setCurrentCourseId(null); setStatus('Fichier texte chargé.'); } }} /></label></div>
        <div className="course-library"><div className="section-head"><h2>Ma bibliothèque</h2></div>{courses.length ? <div className="course-list">{courses.map(c => <button key={c.id} className={currentCourseId === c.id ? 'course-item active' : 'course-item'} onClick={() => selectCourse(c)}><strong>{c.title}</strong><small>{new Date(c.created_at).toLocaleDateString('fr-FR')}</small></button>)}</div> : <p className="muted">Aucun cours enregistré pour le moment.</p>}</div>
        <input className="text-input" placeholder="Titre du cours" value={courseTitle} onChange={e => setCourseTitle(e.target.value)} />
        <textarea className="course-text" placeholder="Colle ici ton cours…" value={courseText} onChange={e => setCourseText(e.target.value)} />
        <div className="action-row"><span className="status">{status}</span><div className="button-pair"><button className="ghost" onClick={saveCourse} disabled={syncing}>☁ Enregistrer</button><button className="primary" disabled={isLoadingAI} onClick={generateFlashcards}>{isLoadingAI ? 'Génération…' : '✦ Générer les flashcards'}</button></div></div>
        <div className="section-head"><h2>Mes paquets</h2></div><div className="deck-grid">{deckViews.map(d => <div className="deck" key={d.id} onClick={() => openStudy(d.id)}><span className="subject">{d.subject}</span><h3>{d.name}</h3><p>{d.count} cartes</p><div className="progress"><i style={{ width: `${Math.round(d.mastered / Math.max(d.count, 1) * 100)}%` }} /></div></div>)}</div>
      </section>}

      {tab === 'study' && <section className="study-wrap">{!currentCard ? <div className="empty"><h2>Rien à réviser ici 🎉</h2><p>Ajoute un cours ou choisis un autre paquet.</p></div> : <div className="study-card"><div className="study-top"><span>{activeDeck ? deckViews.find(d => d.id === activeDeck)?.name : 'Révision du jour'}</span><span>{studyIndex + 1}/{currentStudyCards.length}</span></div><div className="question"><span className="tag">Question</span><h2>{currentCard.question}</h2></div>{showAnswer ? <div className="answer"><span className="tag">Réponse</span><ReactMarkdown
  remarkPlugins={[remarkMath]}
  rehypePlugins={[rehypeKatex]}
>
  {currentCard.answer}
</ReactMarkdown></div> : <button className="reveal" onClick={() => setShowAnswer(true)}>Afficher la réponse</button>}{showAnswer && <div className="ratings">{LEVELS.map(level => <button key={level} onClick={() => rateCard(level)}>{level}</button>)}</div>}</div>}</section>}

      {tab === 'ai' && <section className="ai-wrap"><div className="chat-panel"><div className="chat-intro"><span className="ai-orb">✦</span><div><h2>Ton professeur particulier</h2><p>La conversation utilise le cours actuellement chargé.</p></div></div><div className="course-context"><span>Cours utilisé par l’IA</span><select value={currentCourseId || ''} onChange={e => { const c = courses.find(x => x.id === e.target.value); if (c) selectCourse(c); }}><option value="">Tous / texte actuel</option>{courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select></div><div className="chat-messages">{chat.length === 0 && <div className="suggestions"><button onClick={() => setChatInput('Explique-moi la dernière notion de mon cours simplement.')}>Explique-moi simplement</button><button onClick={() => setChatInput('Interroge-moi sur mon cours, une question à la fois.')}>Interroge-moi</button><button onClick={() => setChatInput('Donne-moi un exercice de niveau prépa basé sur mon cours.')}>Crée un exercice</button></div>}{chat.map((m, i) => <div key={i} className={m.role === 'user' ? 'bubble user' : 'bubble'}><ReactMarkdown
  remarkPlugins={[remarkMath]}
  rehypePlugins={[rehypeKatex]}
>
  {m.text}
</ReactMarkdown></div>)}{isLoadingAI && <div className="bubble">Réflexion…</div>}</div><div className="chat-input"><textarea value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); askAI(); } }} placeholder="Demande-moi quelque chose…" /><button className="primary" onClick={askAI} disabled={isLoadingAI}>Envoyer</button></div></div></section>}
    </main>

    <nav className="mobile-nav">{[['home','⌂','Accueil'],['courses','▤','Cours'],['study','◉','Réviser'],['ai','✦','IA']].map(([id, icon, label]) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}><span>{icon}</span><small>{label}</small></button>)}<button onClick={installApp}><span>⬇</span><small>Installer</small></button></nav>

    {showInstallHelp && <div className="modal-backdrop" onClick={() => setShowInstallHelp(false)}><div className="install-modal" onClick={e => e.stopPropagation()}><button className="modal-close" onClick={() => setShowInstallHelp(false)}>×</button><span className="tag">Installation</span><h2>Ajouter Prépa AI à l'écran d'accueil</h2><p><b>iPhone :</b> ouvre Prépa AI dans Safari, touche <b>Partager</b>, puis <b>Sur l'écran d'accueil</b>.</p><p><b>Android :</b> dans Chrome, ouvre le menu ⋮ puis <b>Installer l'application</b> ou <b>Ajouter à l'écran d'accueil</b>.</p><button className="primary full" onClick={() => setShowInstallHelp(false)}>Compris</button></div></div>}
  </div>;
}

createRoot(document.getElementById('root')).render(<App />);
