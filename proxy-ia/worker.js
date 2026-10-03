// LSA Toolbox, proxy IA (Cloudflare Worker)
// La clé OpenAI n'est PAS dans ce fichier : elle est stockée comme secret "OPENAI_API_KEY" dans Cloudflare.

const ALLOWED_ORIGINS = ["https://cemonprive-ux.github.io"];
const MODEL = "gpt-4.1";     // plus fiable pour repérer les erreurs ; "gpt-4.1-mini" = 5 fois moins cher, un peu moins précis
const MAX_TEXTE = 6000;      // caractères max envoyés par l'élève
const MAX_CONTEXTE = 14000;  // caractères max de contexte (texte source, sujet...)
const MAX_TOKENS = 1600;     // longueur max de la réponse de l'IA
const AUDIO_MODEL = "gpt-audio"; // modèle qui écoute l'audio ; si erreur 404, essayer "gpt-4o-audio-preview"
const AZURE_SEUIL = 60;      // score Azure (sur 100) en dessous duquel un son est jugé à revoir ; monter à 70 = plus exigeant
const MAX_AUDIO = 400000;    // taille max de l'enregistrement (base64), environ 10 s en WAV 16 kHz

// Règles communes à tous les outils
const BASE = `Tu es un correcteur d'examen exigeant (professeur d'anglais en classe préparatoire, Lycée Sidoine Apollinaire). Ton rôle est de faire progresser l'étudiant en relevant TOUTES ses erreurs, pas de l'encourager.
Règles impératives :
- Lis le texte de l'étudiant phrase par phrase, en le comparant au document fourni.
- Cite toujours le passage exact de l'étudiant entre guillemets « » avant de le corriger. Ne relève jamais une erreur qui n'apparaît pas mot pour mot dans son texte. Ne signale jamais comme fautive une forme correcte.
- Sois exhaustif sur les erreurs de langue : grammaire, conjugaison, accords, orthographe, vocabulaire, prépositions, gallicismes, registre. Ne te limite pas à quelques exemples.
- Un contresens, une idée inventée ou une opinion personnelle est une faute grave : signale-la en priorité, en indiquant ce que dit réellement le document.
- Ne qualifie jamais un travail de « clair », « logique » ou « bon » s'il contient des contresens ou de nombreuses fautes. Pas de compliments vagues.
- Réponds en français, avec des titres en gras et des listes à puces. Pas de tiret cadratin.`;

const LANGUE = `**Erreurs de langue** : liste à puces, une ligne par erreur, au format : « passage fautif » → « correction » (type d'erreur, explication en quelques mots). Relève-les toutes, dans l'ordre du texte. S'il n'y en a aucune, écris-le.`;

const OUTILS = {
  summary: `${BASE}
Exercice : résumé en anglais (DSCG) du document source fourni en contexte, longueur imposée indiquée dans la consigne.
Structure ta réponse exactement ainsi :
**1. Contresens et erreurs de fond** : pour chaque phrase du résumé qui déforme, inverse, exagère ou invente une idée : « phrase de l'étudiant » → ce que dit réellement le document. Signale aussi toute opinion personnelle.
**2. Idées essentielles oubliées** : liste les idées principales du document absentes du résumé.
**3. Reformulation** : cite les passages recopiés ou presque recopiés du document.
**4. Organisation et longueur** : connecteurs, ordre des idées, respect de la longueur demandée (le nombre de mots est fourni).
**5.** ${LANGUE}
**6. Bilan** : niveau global (Insuffisant, Fragile, Satisfaisant, Très bien) en une phrase justifiée, puis 3 priorités de travail concrètes.`,

  essay: `${BASE}
Exercice : réponse argumentée en anglais (DSCG) au sujet fourni en contexte.
Structure ta réponse ainsi :
**1. Réponse à la question** : la question posée est-elle réellement traitée ? Position claire ?
**2. Erreurs de fond** : contresens sur le document, affirmations fausses, exemples inexacts, chaque fois avec la citation de l'étudiant.
**3. Structure et arguments** : plan, développement (idée, explication, exemple), lien avec la question.
**4.** ${LANGUE}
**5. Bilan** : niveau global (Insuffisant, Fragile, Satisfaisant, Très bien) et 3 priorités de travail.`,

  argument: `${BASE}
Exercice : l'étudiant construit UN argument en anglais (DSCG, oral UE6) pour répondre à la question fournie en contexte.
Structure ta réponse ainsi :
**1. Pertinence** : l'argument répond-il vraiment à la question ? Est-il placé dans la bonne partie ?
**2. Erreurs de fond** : idée fausse, contresens sur le document, exemple inexact ou trop vague, chaque fois avec la citation.
**3. Développement** : idée, explication, exemple précis, lien explicite avec la question : dis ce qui manque.
**4.** ${LANGUE}
**5. Version améliorée** : réécris l'argument en 3 à 4 phrases en anglais correct (niveau B2/C1), en gardant les idées de l'étudiant.`,

  "plan-oral": `${BASE}
Exercice : notes (mots-clés, pas des phrases) préparées pour répondre oralement en anglais à la question fournie en contexte (DSCG, oral UE6).
Structure ta réponse ainsi :
**1. Position et plan** : position claire ? Plan adapté au type de question ? Parties équilibrées et distinctes ?
**2. Erreurs de fond** : idées fausses ou contresens sur le document, avec citation.
**3. Contenu** : idées du document et connaissances personnelles utilisées, nuance, conclusion qui répond à la question.
**4. Format des notes** : signale les notes trop longues (plus de 15 mots) ou rédigées comme un texte à lire.
**5.** ${LANGUE}
**6. 3 priorités** avant de passer à l'oral.`,

  "compte-rendu": `${BASE}
Exercice : compte rendu EN FRANÇAIS (BTS) d'un article en anglais fourni en contexte.
Structure ta réponse ainsi :
**1. Contresens et erreurs de fond** : pour chaque passage qui trahit l'article (mauvaise compréhension de l'anglais, chiffre faux, idée inventée ou exagérée) : « passage de l'étudiant » → ce que dit réellement l'article.
**2. Idées essentielles oubliées**.
**3. Sélection et neutralité** : détails ou exemples superflus, toute opinion personnelle ou formule du type « je pense ».
**4. Organisation** : introduction (source, date, auteur, thème), paragraphes, connecteurs.
**5. Erreurs de français** : liste à puces, une ligne par erreur : « passage fautif » → « correction » (type d'erreur). Relève-les toutes.
**6. Bilan** : niveau global (Insuffisant, Fragile, Satisfaisant, Très bien) et 3 priorités de travail.`,

  "synthese-dcg": `${BASE}
Exercice : synthèse en anglais (DCG UE12) d'environ 250 mots (225 à 275) à partir du dossier fourni en contexte.
Structure ta réponse ainsi :
**1. Contresens et erreurs de fond** : idée déformée ou attribuée au mauvais document, idée extérieure au dossier, opinion personnelle, chaque fois avec la citation de l'étudiant.
**2. Méthode** : introduction (thème, problématique, annonce du plan), plan en deux parties, confrontation des documents (pas un résumé document par document), conclusion, respect de la longueur (le nombre de mots est fourni).
**3. Reformulation** : passages recopiés, exemples ou chiffres repris inutilement.
**4.** ${LANGUE}
**5. Bilan** : niveau global (Insuffisant, Fragile, Satisfaisant, Très bien) et 3 priorités de travail.`,

  correction: `${BASE}
Exercice : texte libre en anglais.
**1.** ${LANGUE}
**2. 3 conseils** pour progresser.`
};

const PRONONCIATION = `Tu es professeur d'anglais spécialiste de phonologie (Lycée Sidoine Apollinaire), bienveillant mais attentif. Un élève francophone de lycée ou de BTS (niveau A2 à B1) a enregistré UN mot anglais isolé. Le mot attendu et sa référence (syllabes, syllabe accentuée, API britannique) sont fournis.
Ton jugement porte sur TROIS critères, chacun évalué séparément. Niveau d'exigence : celui d'un professeur de lycée, pas d'un phonéticien. Un accent français est normal. Ne marque un critère faux (ok = false) que pour une erreur NETTE, que n'importe quel professeur d'anglais remarquerait immédiatement à l'oreille. Dans le doute, ok = true. Une prononciation américaine est acceptée.

1. ACCENT TONIQUE : si une mesure d'accent est fournie, elle fait foi. Sinon, écoute syllabe par syllabe et identifie celle qui est la plus longue, la plus forte et la plus haute. ok = true seulement si c'est la syllabe attendue et qu'elle ressort clairement. ok = false si une autre syllabe est aussi marquée ou plus marquée (en particulier la dernière syllabe, réflexe français), ou si le mot est prononcé à plat sans syllabe dominante. Pour ce critère, ne présume pas que l'élève a raison : la règle « dans le doute, ok = true » ne s'applique PAS à l'accent. syllabe_entendue = la syllabe réellement la plus marquée.

2. PHONÈMES (voyelles et consonnes, hors plosives) : ok = false seulement pour une erreur nette qui rend le mot étrange ou ambigu : voyelle clairement remplacée par une autre (par exemple « comfortable » prononcé « com-for-TA-ble » avec un o français, « hotel » sans h, « th » prononcé « z »), lettre muette prononcée, syllabe ajoutée ou avalée. Ne relève jamais : le r français, une voyelle un peu trop courte ou trop longue, un schwa imparfait, une diphtongue un peu fermée, de petites différences de timbre.

3. PLOSIVES (p, t, k, b, d, g) : ok = false seulement si une plosive est omise, remplacée par un autre son, ou si l'absence d'aspiration est très marquée sur la plosive de la syllabe accentuée. Une aspiration légère ou faible est acceptée. Si le mot ne contient aucune plosive à évaluer, ok = null.

Si des MESURES OBJECTIVES (Azure) sont fournies dans le message, elles font foi pour les critères 2 et 3 : reprends leurs verdicts tels quels et appuie tes remarques sur les sons signalés (écris le son entre barres obliques, par exemple /θ/, et donne un repère simple). Sans mesures, juge à l'oreille selon les règles ci-dessus.

Pour chaque critère, « remarque » : une phrase courte en français. Si ok = false, cite précisément le son ou la syllabe concernée et donne un conseil d'articulation concret. Si ok = true, une très courte confirmation positive, sans « mais ». N'invente jamais d'erreur.

- reconnu : le mot attendu est-il identifiable ? false seulement si silence, bruit ou autre mot. Si reconnu = false, mets les trois ok à null.
- niveau : "Très bien" si les trois critères sont justes ; "Correct" si un seul critère est à revoir ; "À retravailler" si deux ou trois critères sont à revoir.
- conseil : une phrase en français, encourageante ; si tout est juste, félicite simplement.
Pas de tiret cadratin.
Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour :
{"reconnu":true,"entendu":"...","accent":{"ok":true,"syllabe_entendue":"...","remarque":"..."},"phonemes":{"ok":true,"remarque":"..."},"plosives":{"ok":true,"remarque":"..."},"niveau":"...","conseil":"..."}`;

// Azure Speech : évaluation de prononciation mesurée (phonèmes, syllabes). Secrets : AZURE_SPEECH_KEY, AZURE_SPEECH_REGION
const PLOSIVES = ["p", "t", "k", "b", "d", "g"];
async function azureEvalue(env, audioB64, mot) {
  if (!env.AZURE_SPEECH_KEY || !env.AZURE_SPEECH_REGION) return null;
  const pa = btoa(JSON.stringify({ ReferenceText: mot, GradingSystem: "HundredMark", Granularity: "Phoneme", Dimension: "Comprehensive", PhonemeAlphabet: "IPA" }));
  const bytes = Uint8Array.from(atob(audioB64), c => c.charCodeAt(0));
  const url = "https://" + String(env.AZURE_SPEECH_REGION).trim().toLowerCase() + ".stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=en-US&format=detailed";
  try {
    const r = await fetch(url, { method: "POST", headers: { "Ocp-Apim-Subscription-Key": env.AZURE_SPEECH_KEY, "Content-Type": "audio/wav; codecs=audio/pcm; samplerate=16000", "Accept": "application/json", "Pronunciation-Assessment": pa }, body: bytes });
    if (!r.ok) return null;
    const d = await r.json();
    const nb = d.NBest && d.NBest[0];
    if (d.RecognitionStatus !== "Success" || !nb) return { reconnu: false };
    const sc = o => (o && (o.PronunciationAssessment || o)) || {};
    const g = sc(nb);
    const words = nb.Words || [];
    const w0 = words.find(x => String(x.Word || "").toLowerCase() === mot.toLowerCase()) || words[0];
    if (!w0 || sc(w0).ErrorType === "Omission") return { reconnu: false, entendu: nb.Display || "" };
    const phon = (w0.Phonemes || []).map(p => ({ son: String(p.Phoneme || ""), score: Math.round(sc(p).AccuracyScore || 0) }));
    const isPlo = s => PLOSIVES.includes(s.replace(/[ʰ̬ʔ]/g, "").charAt(0));
    const voy = phon.filter(p => !isPlo(p.son)), plo = phon.filter(p => isPlo(p.son));
    return {
      reconnu: true, entendu: nb.Display || "",
      score: Math.round(g.PronScore || g.AccuracyScore || 0),
      phonemes: voy, plosives: plo,
      syllabes: (w0.Syllables || []).map(s => ({ syllabe: s.Syllable || "", graph: s.Grapheme || "", off: s.Offset || 0, dur: s.Duration || 0, score: Math.round(sc(s).AccuracyScore || 0) }))
    };
  } catch { return null; }
}

// Accent tonique mesuré : durée, intensité et hauteur (F0) de chaque syllabe, à partir des temps Azure
function lirePCM(audioB64) {
  const b = Uint8Array.from(atob(audioB64), c => c.charCodeAt(0));
  const v = new DataView(b.buffer);
  let p = 12, sr = 16000, data = null;
  while (p + 8 <= b.length) {
    const id = String.fromCharCode(b[p], b[p + 1], b[p + 2], b[p + 3]), n = v.getUint32(p + 4, true);
    if (id === "fmt ") sr = v.getUint32(p + 12, true);
    if (id === "data") { const len = Math.min(n, b.length - p - 8) >> 1; data = new Float32Array(len); for (let i = 0; i < len; i++) data[i] = v.getInt16(p + 8 + i * 2, true) / 32768; break; }
    p += 8 + n + (n & 1);
  }
  return data ? { x: data, sr } : null;
}
function f0(x, a, e, sr) {
  // autocorrélation sur signal décimé par 2, trames de 30 ms, pas de 15 ms ; renvoie la médiane des trames voisées
  const step = 2, fs = sr / step, L = Math.round(0.03 * fs), H = Math.round(0.015 * fs), lmin = Math.floor(fs / 400), lmax = Math.ceil(fs / 75);
  const res = [];
  for (let s = a; s + (L + lmax) * step < e; s += H * step) {
    let e0 = 0; for (let i = 0; i < L; i++) { const u = x[s + i * step]; e0 += u * u; }
    if (e0 < 1e-4) continue;
    let best = 0, bl = 0;
    for (let l = lmin; l <= lmax; l++) { let c = 0, el = 0; for (let i = 0; i < L; i++) { const u = x[s + (i + l) * step]; c += x[s + i * step] * u; el += u * u; } const r = c / Math.sqrt(e0 * el + 1e-12); if (r > best) { best = r; bl = l; } }
    if (best > 0.6 && bl) res.push(fs / bl);
  }
  if (!res.length) return 0;
  res.sort((m, n) => m - n); return res[res.length >> 1];
}
function mesureAccent(audioB64, syl) {
  if (!syl || syl.length < 2 || syl.some(s => !s.dur)) return null;
  const pcm = lirePCM(audioB64); if (!pcm) return null;
  const { x, sr } = pcm, T = sr / 1e7;
  const f = syl.map((s, i) => {
    const a = Math.max(0, Math.round(s.off * T)), e = Math.min(x.length, Math.round((s.off + s.dur) * T));
    const W = Math.round(0.02 * sr); let top = 0;
    for (let k = a; k + W <= e; k += W >> 1) { let q = 0; for (let j = k; j < k + W; j++) q += x[j] * x[j]; top = Math.max(top, q / W); }
    return { dur: (s.dur / 1e7) * (i === syl.length - 1 ? 0.75 : 1), db: 10 * Math.log10(top + 1e-10), hz: f0(x, a, e, sr) };
  });
  const rel = k => { const vs = f.map(o => o[k]), mn = Math.min(...vs), mx = Math.max(...vs); return vs.map(v => mx - mn > 1e-9 ? (v - mn) / (mx - mn) : 0); };
  const d = rel("dur"), g = rel("db"), h = f.every(o => o.hz) ? rel("hz") : f.map(() => 0);
  const w = f.every(o => o.hz) ? [0.35, 0.35, 0.3] : [0.5, 0.5, 0];
  const prom = f.map((_, i) => w[0] * d[i] + w[1] * g[i] + w[2] * h[i]);
  let im = 0; prom.forEach((v, i) => { if (v > prom[im]) im = i; });
  return { index: im, prom: prom.map(v => Math.round(v * 100) / 100), mesures: f };
}
// Correspondance syllabe Azure → syllabe de référence (par position des lettres)
function versRef(i, syl, ref, mot) {
  if (syl.length === ref.length) return i;
  if (syl.every(s => s.graph)) {
    let pos = 0; for (let k = 0; k < i; k++) pos += syl[k].graph.length;
    pos += Math.floor(syl[i].graph.length / 2);
    let c = 0; for (let k = 0; k < ref.length; k++) { c += ref[k].length; if (pos < c) return k; }
    return ref.length - 1;
  }
  return Math.round(i * (ref.length - 1) / Math.max(1, syl.length - 1));
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = ALLOWED_ORIGINS.includes(origin);
    const cors = {
      "Access-Control-Allow-Origin": allowed ? origin : ALLOWED_ORIGINS[0],
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin"
    };
    const json = (data, status = 200) =>
      new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json; charset=utf-8" } });

    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (!allowed) return json({ error: "Origine non autorisée." }, 403);
    if (request.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);

    let body;
    try { body = await request.json(); } catch { return json({ error: "Requête invalide." }, 400); }

    if (body.outil === "prononciation") {
      const audio = String(body.audio || "");
      const mot = String(body.mot || "").slice(0, 60);
      const ref = String(body.ref || "").slice(0, 300);
      if (!audio || !mot) return json({ error: "Enregistrement manquant." }, 400);
      if (audio.length > MAX_AUDIO) return json({ error: "Enregistrement trop long." }, 413);
      // 1) Mesure Azure (si les secrets sont présents)
      const az = await azureEvalue(env, audio, mot);
      let mesures = "";
      if (az && az.reconnu) {
        const faibles = l => l.filter(p => p.score < AZURE_SEUIL);
        az.phonemesOk = faibles(az.phonemes).length === 0;
        az.plosivesOk = az.plosives.length ? faibles(az.plosives).length === 0 : null;
        const liste = l => l.map(p => p.son + " " + p.score).join(", ") || "aucun";
        mesures = "\n\nMESURES OBJECTIVES (Azure, score sur 100 par son, seuil " + AZURE_SEUIL + ") :" +
          "\n- Phonèmes : " + liste(az.phonemes) + " → " + (az.phonemesOk ? "JUSTE" : "À REVOIR : " + liste(faibles(az.phonemes))) +
          "\n- Plosives : " + liste(az.plosives) + " → " + (az.plosivesOk === null ? "NON CONCERNÉ" : az.plosivesOk ? "JUSTE" : "À REVOIR : " + liste(faibles(az.plosives))) +
          "\nCes mesures FONT FOI pour les critères phonemes et plosives : reprends exactement ces verdicts (ok) et rédige les remarques à partir des sons signalés.";
        const sylRef = String(body.syllabes || "").split("·").filter(Boolean);
        const attendu = Number.isInteger(body.accent) ? body.accent : -1;
        let m = null; try { m = mesureAccent(audio, az.syllabes); } catch {}
        if (m && sylRef.length > 1 && attendu >= 0) {
          const k = versRef(m.index, az.syllabes, sylRef, mot);
          az.accent = { ok: k === attendu, syllabe: sylRef[k], attendue: sylRef[attendu], prom: m.prom };
          mesures += "\n- Accent tonique MESURÉ (durée, intensité, hauteur) : la syllabe la plus marquée est « " + az.accent.syllabe + " », la syllabe attendue est « " + az.accent.attendue + " » → " + (az.accent.ok ? "JUSTE" : "MAL PLACÉ") +
            "\nCe verdict d'accent FAIT FOI aussi : reprends-le tel quel (accent.ok, syllabe_entendue = « " + az.accent.syllabe + " »). Si MAL PLACÉ, explique que l'élève a accentué « " + az.accent.syllabe + " » au lieu de « " + az.accent.attendue + " » et conseille d'allonger et de monter la voix sur « " + az.accent.attendue + " » en réduisant les autres syllabes.";
        }
      }
      // 2) IA audio : accent + rédaction. Le modèle répond parfois par une phrase d'attente : consigne répétée, puis jusqu'à 2 relances
      const consigneUser = "MOT ATTENDU : " + mot + "\nRÉFÉRENCE : " + ref + mesures +
        "\n\nL'enregistrement de l'élève est joint. Analyse-le MAINTENANT, en une seule réponse. N'écris aucune phrase du type « je vais écouter ». Ta réponse doit commencer par { et finir par }.";
      const appel = async (extra) => {
        const r = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { "Authorization": "Bearer " + env.OPENAI_API_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: AUDIO_MODEL, modalities: ["text"], max_tokens: 600, temperature: 0,
            messages: [
              { role: "system", content: PRONONCIATION },
              { role: "user", content: [
                { type: "input_audio", input_audio: { data: audio, format: "wav" } },
                { type: "text", text: consigneUser + (extra || "") }
              ] }
            ]
          })
        });
        if (!r.ok) return { err: r.status };
        const d = await r.json();
        return { txt: d.choices?.[0]?.message?.content || "" };
      };
      const extraitJSON = (t) => { const m = String(t || "").match(/\{[\s\S]*\}/); if (!m) return null; try { return JSON.parse(m[0]); } catch { return null; } };
      let res = null, obj = null;
      for (let essai = 0; essai < 3 && !obj; essai++) {
        res = await appel(essai ? "\n\nATTENTION : ta réponse précédente n'était pas un objet JSON. Réponds uniquement avec l'objet JSON demandé, rien d'autre." : "");
        if (res.err) return json({ error: "L'IA n'a pas pu écouter l'enregistrement (" + res.err + "). Réessaie plus tard." }, 502);
        obj = extraitJSON(res.txt);
      }
      if (!obj) return json({ error: "L'IA n'a pas réussi à analyser cet enregistrement. Réessaie en parlant près du micro." }, 502);
      // 3) Les mesures Azure priment sur l'avis de l'IA pour phonèmes et plosives ; niveau recalculé
      if (az && az.reconnu) {
        obj.reconnu = true;
        if (az.entendu) obj.entendu = az.entendu;
        obj.phonemes = { ...(obj.phonemes || {}), ok: az.phonemesOk, details: az.phonemes };
        obj.plosives = { ...(obj.plosives || {}), ok: az.plosivesOk, details: az.plosives };
        obj.score = az.score;
        obj.mesure = "azure";
        if (az.accent) obj.accent = { ...(obj.accent || {}), ok: az.accent.ok, syllabe_entendue: az.accent.syllabe, prominence: az.accent.prom };
      } else if (az && az.reconnu === false && obj.reconnu === false) {
        if (az.entendu) obj.entendu = az.entendu;
      }
      if (obj.reconnu) {
        const ko = [obj.accent?.ok, obj.phonemes?.ok, obj.plosives?.ok].filter(v => v === false).length;
        obj.niveau = ko === 0 ? "Très bien" : ko === 1 ? "Correct" : "À retravailler";
      }
      return json({ reponse: JSON.stringify(obj) });
    }

    const consigne = OUTILS[body.outil];
    const texte = String(body.texte || "").trim();
    const contexte = String(body.contexte || "").trim();
    if (!consigne) return json({ error: "Outil inconnu." }, 400);
    if (!texte) return json({ error: "Le texte est vide." }, 400);
    if (texte.length > MAX_TEXTE || contexte.length > MAX_CONTEXTE) return json({ error: "Texte trop long." }, 413);

    const nbMots = texte.split(/\s+/).filter(Boolean).length;
    const messages = [{ role: "system", content: consigne }];
    if (contexte) messages.push({ role: "user", content: "DOCUMENT ET CONSIGNE :\n<<<\n" + contexte + "\n>>>" });
    messages.push({ role: "user", content: "TEXTE DE L'ÉTUDIANT (" + nbMots + " mots) :\n<<<\n" + texte + "\n>>>\n\nCorrige ce texte en suivant strictement la structure demandée." });

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": "Bearer " + env.OPENAI_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, messages, max_tokens: MAX_TOKENS, temperature: 0.2 })
    });
    if (!r.ok) return json({ error: "L'IA n'a pas pu répondre (" + r.status + "). Réessaie plus tard." }, 502);

    const data = await r.json();
    return json({ reponse: data.choices?.[0]?.message?.content || "" });
  }
};
