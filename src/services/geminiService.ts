import config from "../config";

export type ResumeStyle =
    | "synthese"
    | "tldr"
    | "drama"
    | "roast"
    | "debat"
    | "chronologique"
    | "officiel";

export const RESUME_STYLE_NAMES: Record<ResumeStyle, string> = {
    synthese: "Synthèse",
    tldr: "TL;DR Express",
    drama: "Drama & Potins",
    roast: "Roast Piquant",
    debat: "Analyse de Débat",
    chronologique: "Chronologie",
    officiel: "Procès-Verbal Officiel",
};

const SYSTEM_BASE = `Tu es un analyste expert chargé de restituer et synthétiser des conversations issues de salons Discord.

Directives absolues d'exécution :
1. Ancrage factuel strict : Base-toi exclusivement sur les messages réels présents dans la transcription fournie. N'invente aucun fait, n'extrapole pas et ne cite aucun membre absent des échanges.
2. Attribution des propos : Cite toujours les pseudonymes exacts des participants en gras (ex: **Pseudo**) pour attribuer clairement qui a exprimé chaque idée.
3. Absence totale de méta-discours : Ne commence JAMAIS par des phrases d'introduction ou de politesse (par exemple "Voici le résumé", "En résumé", "Bien sûr"). Entre directement dans le contenu structuré.
4. Politique d'utilisation des émojis :
   - Fais preuve d'un équilibre sobre, naturel et modéré.
   - N'utilise un émoji que s'il apporte une réelle valeur expressive ou visuelle au ton demandé.
   - Il est parfaitement normal et accepté de n'en mettre aucun si le contexte est sérieux ou purement factuel.
   - N'accumule jamais plusieurs émojis d'affilée et ne force jamais leur présence sur chaque ligne.
5. Formatage Discord : Utilise la syntaxe Markdown Discord (listes à puces avec tirets -, gras avec **, sous-titres avec **Titre**). Reste impérativement sous la limite de 3500 caractères.`;

const STYLE_INSTRUCTIONS: Record<ResumeStyle, string> = {
    synthese: `Rôle : Analyste de synthèse équilibrée.
Mission : Rédige une synthèse claire et structurée de la discussion selon ces trois sections obligatoires :
- **Sujets abordés** : Les thèmes principaux au cœur de la discussion.
- **Positions et échanges clés** : Le détail des arguments et interventions notables de chaque participant (**Pseudo**).
- **Consensus ou conclusion** : Les accords trouvés, les désaccords persistants ou les décisions prises.
Ton : Neutre, limpide et informatif.`,

    tldr: `Rôle : Synthétiseur ultra-concis.
Mission : Produis un condensé express en exactement 3 ou 4 puces directes débutant par un tiret (-).
Contraintes impératives :
- Aucun titre de section, aucune phrase d'amorce, aucune conclusion.
- Chaque puce doit faire au maximum 2 phrases courtes et aller immédiatement à l'essentiel.
Ton : Direct, minimaliste et sans fioriture.`,

    drama: `Rôle : Chroniqueur sensationnaliste de téléréalité.
Mission : Raconte la discussion comme le feuilleton ou le potin majeur du serveur.
Contraintes :
- Dramatise avec humour les désaccords, les réponses tardives, les réactions exagérées et les petites rivalités amicales.
- Reste strictement fidèle aux échanges réels : pas de diffamation ni d'inventions malveillantes.
- Émojis : Utilisation ponctuelle autorisée pour accentuer le côté théâtral, sans surcharge.
Ton : Théâtral, croustillant et sensationnel.`,

    roast: `Rôle : Humoriste satirique de stand-up.
Mission : Rédige une satire piquante et bienveillante des échanges du salon.
Contraintes :
- Moque-toi gentiment des débats futiles, de la mauvaise foi amicale, des arguments bancals et des fixations des membres (**Pseudo**).
- Reste bienveillant : aucune vulgarité, aucune insulte blessante, aucune discrimination.
Ton : Sarcastique, ironique et percutant.`,

    debat: `Rôle : Modérateur et analyste de rhétorique.
Mission : Décortique la confrontation d'idées selon la structure suivante :
- **Question au centre du débat** : La problématique disputée par les membres.
- **Positions et arguments** : Les thèses en présence, avec le détail des points défendus par chaque **Pseudo**.
- **Points de friction ou d'accord** : Les moments charnières où le débat s'est intensifié ou stabilisé.
- **Verdict analytique** : Bilan objectif sur la solidité et l'aboutissement de la confrontation.
Ton : Méthodologique, rigoureux et impartial.`,

    chronologique: `Rôle : Archiviste et chroniqueur temporel.
Mission : Reconstitue chronologiquement le fil des échanges étape par étape.
Structure :
- Découpe la conversation par séquences ordonnées avec repères temporels (ex: [14:05], [14:30]) extraits de la transcription.
- Mets en évidence l'amorce de la discussion, les relances et la conclusion finale.
Ton : Factuel, ordonné et descriptif.`,

    officiel: `Rôle : Secrétaire général institutionnel.
Mission : Rédige un procès-verbal formel et solennel selon la structure suivante :
- **Ordre du jour constaté** : Objet de l'échange.
- **Délibérations et interventions** : Compte-rendu des déclarations notables de chaque participant (**Pseudo**) dans un registre administratif soutenu.
- **Résolutions adoptées** : Décisions retenues ou points classés sans suite.
Contrainte : Style corporate très soutenu. Aucun émoji dans ce mode.
Ton : Solennel, administratif et protocolaire.`,
};

export async function summarizeTranscript(
    transcript: string,
    style: ResumeStyle,
    topic?: string,
): Promise<string> {
    if (!config.geminiApiKey) {
        throw new Error("La clé d'API Gemini n'est pas configurée.");
    }

    const specificStyleInstruction =
        STYLE_INSTRUCTIONS[style] || STYLE_INSTRUCTIONS.synthese;
    const systemInstructionText = `${SYSTEM_BASE}\n\n${specificStyleInstruction}`;

    let userPrompt = `Voici la transcription intégrale des messages du salon Discord :\n\n${transcript}\n\n`;

    if (topic && topic.trim()) {
        userPrompt += `Consigne prioritaire de focalisation :\nL'utilisateur a spécifiquement demandé de concentrer le résumé sur le sujet suivant : "${topic.trim()}".\n- Oriente ton analyse, tes synthèses et tes mentions d'utilisateurs prioritairement autour de ce sujet.\n- Écarte les discussions annexes qui ne concernent pas ce thème.\n\n`;
    }

    userPrompt +=
        "Génère maintenant le résumé demandé en français en respectant scrupuleusement les consignes et le style.";

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${config.geminiModel}:generateContent?key=${config.geminiApiKey}`;

    const isCreativeStyle = style === "drama" || style === "roast";
    const temperature = isCreativeStyle ? 0.7 : 0.25;

    const requestBody = {
        systemInstruction: {
            parts: [{ text: systemInstructionText }],
        },
        contents: [
            {
                role: "user",
                parts: [{ text: userPrompt }],
            },
        ],
        generationConfig: {
            temperature,
            maxOutputTokens: 2048,
        },
    };

    const response = await fetch(endpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
            `Erreur API Gemini (${response.status}) : ${errorText}`,
        );
    }

    const data = (await response.json()) as {
        candidates?: Array<{
            content?: {
                parts?: Array<{
                    text?: string;
                }>;
            };
        }>;
    };

    const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!generatedText || !generatedText.trim()) {
        throw new Error(
            "L'API Gemini n'a renvoyé aucun contenu pour cette discussion.",
        );
    }

    let cleaned = generatedText.trim();
    if (cleaned.length > 4000) {
        cleaned = `${cleaned.slice(0, 3950)}\n\n*(Résumé tronqué : limite Discord atteinte)*`;
    }

    return cleaned;
}
