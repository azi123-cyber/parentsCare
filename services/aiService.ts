import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { BraceletData, PhoneData, AnalysisResult } from "../types";

// Configuration for API Keys
const API_KEYS = {
    GROK: (import.meta as any).env.VITE_GROK_API_KEY || null,
    GEMINI: (import.meta as any).env.VITE_GEMINI_API_KEY || null,
    OPENAI: (import.meta as any).env.VITE_OPENAI_API_KEY || null,
};

// --- CLIENT INITIALIZATIONS ---

// 1. Grok (xAI)
const xaiClient = API_KEYS.GROK ? new OpenAI({
    apiKey: API_KEYS.GROK,
    baseURL: "https://api.x.ai/v1",
    dangerouslyAllowBrowser: true
}) : null;

// 2. Gemini (Google)
const geminiClient = API_KEYS.GEMINI ? new GoogleGenerativeAI(API_KEYS.GEMINI) : null;

// 3. OpenAI
const openaiClient = API_KEYS.OPENAI ? new OpenAI({
    apiKey: API_KEYS.OPENAI,
    dangerouslyAllowBrowser: true
}) : null;

// --- UTILS ---

const AI_USAGE_KEY = 'ai_usage_limit';
const MAX_AI_USAGE = 10;

export const getAiUsageData = () => {
    const data = JSON.parse(localStorage.getItem(AI_USAGE_KEY) || '{"count": 0, "lastDate": ""}');
    const today = new Date().toISOString().split('T')[0];

    if (data.lastDate !== today) {
        return { count: 0, lastDate: today };
    }
    return data;
};

const incrementAiUsage = () => {
    const data = getAiUsageData();
    data.count += 1;
    localStorage.setItem(AI_USAGE_KEY, JSON.stringify(data));
};

export const getAiUsageCount = (): number => {
    return getAiUsageData().count;
};

const getPrompt = (bracelet: BraceletData, phone: PhoneData) => `
Bertindaklah sebagai sistem keamanan pelacak anak "Guardian AI".

DATA SENSOR:
- Gelang (Arduino): Koneksi=${bracelet.status}, Baterai=${bracelet.batteryLevel}%, Alarm=${bracelet.isBuzzerOn}, Lampu=${bracelet.isLedOn}
- HP Anak: Online=${phone.isOnline}, Baterai=${phone.batteryLevel}%, GPS=${phone.location ? "Aktif" : "Mati"}

Tugas: Analisis keamanan anak.
Format JSON: { "message": "...", "recommendation": "...", "riskLevel": "Aman/Waspada/Bahaya" }
`;

// --- MAIN AI SERVICE ---

export const analyzeSafetyStatus = async (bracelet: BraceletData, phone: PhoneData): Promise<AnalysisResult> => {
    // Check if limit reached
    if (getAiUsageCount() >= MAX_AI_USAGE) {
        const message = "Batas 10 scan AI/hari tercapai. Silakan perpanjang akses: Hubungi WA 082210815437";
        return {
            message,
            recommendation: "Pesan paket premium untuk scan tak terbatas.",
            riskLevel: "Quota Habis"
        };
    }

    const prompt = getPrompt(bracelet, phone);

    // Tier 1: Grok (xAI)
    if (xaiClient) {
        try {
            console.log("Attempting Analysis with Grok...");
            const completion = await xaiClient.chat.completions.create({
                model: "grok-beta",
                messages: [
                    { role: "system", content: "You are a helpful safety assistant. Respond in JSON." },
                    { role: "user", content: prompt }
                ],
                response_format: { type: "json_object" }
            });
            const content = completion.choices[0].message.content;
            if (content) {
                incrementAiUsage();
                return JSON.parse(content) as AnalysisResult;
            }
        } catch (error) {
            console.warn("Grok Error:", error);
        }
    }

    // Tier 2: Gemini
    if (geminiClient) {
        try {
            console.log("Attempting Analysis with Gemini...");
            const model = geminiClient.getGenerativeModel({ model: "gemini-2.5-flash" });
            const result = await model.generateContent(prompt + "\nRespond ONLY with valid JSON.");
            const response = await result.response;
            let text = response.text();
            // Basic JSON extraction if model wraps it in markdown
            text = text.replace(/```json/g, "").replace(/```/g, "").trim();
            incrementAiUsage();
            return JSON.parse(text) as AnalysisResult;
        } catch (error) {
            console.warn("Gemini Error:", error);
        }
    }

    // Tier 3: OpenAI
    if (openaiClient) {
        try {
            console.log("Attempting Analysis with OpenAI...");
            const completion = await openaiClient.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    { role: "system", content: "You are a helpful safety assistant. Respond in JSON." },
                    { role: "user", content: prompt }
                ],
                response_format: { type: "json_object" }
            });
            const content = completion.choices[0].message.content;
            if (content) {
                incrementAiUsage();
                return JSON.parse(content) as AnalysisResult;
            }
        } catch (error) {
            console.warn("OpenAI Error:", error);
        }
    }

    // Tier 4: Fallback to Simulator
    console.warn("All AI services failed or unavailable. Using Simulator.");
    return simulateAnalysis(bracelet, phone);
};

// --- OFFLINE SIMULATOR (Rules Based) ---
// Menghemat kuota dan memastikan app tetap jalan
export const simulateAnalysis = (bracelet: BraceletData, phone: PhoneData): AnalysisResult => {
    // Simulasi delay biar terasa "mikir"
    return new Promise((resolve) => {
        setTimeout(() => {
            let riskLevel: 'Aman' | 'Waspada' | 'Bahaya' = 'Aman';
            let message = "Sistem berjalan normal. Semua sensor aman.";
            let recommendation = "Lanjutkan pemantauan berkala.";

            // Logika Deteksi Bahaya Sederhana
            if (bracelet.status === 'terputus') {
                riskLevel = 'Waspada';
                message = "Peringatan: Koneksi gelang tidak stabil.";
                recommendation = "Cek koneksi bluetooth dan pastikan anak dalam jangkauan.";
            }

            if (phone.batteryLevel < 20 && phone.batteryLevel > 0) {
                riskLevel = 'Waspada';
                message += " Baterai HP anak lemah.";
                recommendation = "Hubungi anak untuk segera mengisi daya.";
            }

            // Kalau Buzzer nyala, anggap Bahaya
            if (bracelet.isBuzzerOn) {
                riskLevel = 'Bahaya';
                message = "ALARM DARURAT AKTIF! Anak mungkin dalam bahaya.";
                recommendation = "Segera cek lokasi fisik anak atau hubungi orang sekitar.";
            }

            resolve({
                message,
                recommendation,
                riskLevel
            });
        }, 1000); // 1 detik delay
    }) as unknown as AnalysisResult;
};
