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

const STYLE_PROMPTS: Record<ResumeStyle, string> = {
    synthese:
        "Tu es un assistant chargé de résumer des échanges sur Discord. Produis une synthèse claire, structurée et équilibrée. Détaille les sujets principaux abordés, les prises de position marquantes et les conclusions éventuelles.",
    tldr: "Tu es un assistant ultra-concis. Produis un TL;DR express en exactement 3 ou 4 puces courtes et percutantes. Chaque puce doit résumer l'essentiel sans fioritures.",
    drama: "Tu es un narrateur sensationnaliste de téléréalité. Raconte la discussion comme un drama palpitant du serveur, en exagérant avec humour les rivalités, les retournements de situation et les réactions exagérées.",
    roast: "Tu es un humoriste sarcastique et piquant. Rédige un roast drôle et bienveillant de la discussion en pointant du doigt les arguments absurdes, les incohérences et les obsessions des participants, sans vulgarité.",
    debat: "Tu es un analyste de débat d'idées. Découpe la discussion en identifiant la thèse principale, les arguments de chaque camp, qui défendait quelle idée et dresse un bilan neutre de l'échange.",
    chronologique:
        "Tu es un archiviste rigoureux. Reconstitue l'ordre chronologique des événements et des échanges, en indiquant les étapes successives et les moments charnières de la conversation.",
    officiel:
        "Tu es le secrétaire général d'une institution solennelle. Rédige un procès-verbal de réunion protocolaire et formel avec ordre du jour tacite, interventions notables des intervenants et résolutions adoptées.",
};

export async function summarizeTranscript(
    transcript: string,
    style: ResumeStyle,
    topic?: string,
): Promise<string> {
    if (!config.geminiApiKey) {
        throw new Error("La clé d'API Gemini n'est pas configurée.");
    }

    const systemInstructionText =
        STYLE_PROMPTS[style] || STYLE_PROMPTS.synthese;

    let userPrompt = `Voici la transcription d'une discussion Discord :\n\n${transcript}\n\n`;

    if (topic && topic.trim()) {
        userPrompt += `Attention : Concentre particulièrement le résumé et l'analyse sur le sujet ou mot-clé suivant : "${topic.trim()}".\n\n`;
    }

    userPrompt +=
        "Rédige le résumé demandé en français, au format Markdown Discord.";

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${config.geminiModel}:generateContent?key=${config.geminiApiKey}`;

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
            temperature: style === "drama" || style === "roast" ? 0.85 : 0.4,
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
