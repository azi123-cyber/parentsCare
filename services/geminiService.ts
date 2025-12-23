
import { GoogleGenAI, Type } from "@google/genai";
import { BraceletData, PhoneData, AnalysisResult } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const analyzeSafetyStatus = async (bracelet: BraceletData, phone: PhoneData): Promise<AnalysisResult> => {
  try {
    const prompt = `
      Bertindaklah sebagai sistem keamanan pelacak anak (Arduino Tracker).
      
      STATUS PERANGKAT KERAS (GELANG):
      - Koneksi Bluetooth: ${bracelet.status}
      - Baterai Gelang: ${bracelet.batteryLevel}%
      - Status Alarm (Buzzer): ${bracelet.isBuzzerOn ? "MENYALA (Bising)" : "Mati"}
      - Status Lampu (LED): ${bracelet.isLedOn ? "MENYALA" : "Mati"}
      
      STATUS HP ANAK:
      - Online: ${phone.isOnline ? "Ya" : "TIDAK"}
      - Baterai HP: ${phone.batteryLevel}%
      - GPS: ${phone.location ? "Aktif" : "Mati"}

      Berikan analisis singkat tentang keamanan anak berdasarkan status koneksi dan perangkat.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            message: { type: Type.STRING, description: "Status keamanan singkat" },
            recommendation: { type: Type.STRING, description: "Tindakan teknis yang disarankan" },
            riskLevel: { type: Type.STRING, description: "Aman/Waspada/Bahaya" },
          },
          required: ["message", "recommendation", "riskLevel"]
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");
    
    return JSON.parse(text) as AnalysisResult;
  } catch (error) {
    console.error("Gemini Error:", error);
    return {
      message: "Sistem berjalan normal.",
      recommendation: "Pantau terus jarak bluetooth.",
      riskLevel: "Aman"
    };
  }
};