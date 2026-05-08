import { useState } from "react";
import { motion } from "motion/react";
import { MessageSquare, Send } from "lucide-react";
import { GlassCard } from "./GlassCard";

export function Communications() {
  const [message, setMessage] = useState("");
  const [selectedMethod, setSelectedMethod] = useState<"whatsapp" | "telegram" | null>(null);

  const handleSend = () => {
    console.log("Sending message:", message, "via", selectedMethod);
  };

  return (
    <div className="p-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-4xl"
      >
        <div className="mb-6">
          <h2 className="text-3xl text-black mb-2">Communications</h2>
          <p className="text-gray-700">Send messages to client employees</p>
        </div>

        <GlassCard>
          <div className="mb-6">
            <p className="text-sm text-gray-700 mb-4">
              Use bulk communication to fix registered employees.
            </p>
          </div>

          <div className="mb-6">
            <label className="block text-gray-700 text-sm mb-2">Message</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={6}
              className="w-full px-4 py-3 rounded-xl bg-white/50 border border-white/70 text-black placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500/60 focus:border-red-500/60 transition-all backdrop-blur-xl resize-none"
              placeholder="Type your message here..."
            />
          </div>

          <div className="mb-6">
            <p className="text-sm text-gray-700 mb-3">Select communication method:</p>
            <div className="flex gap-4">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setSelectedMethod("whatsapp")}
                className={`flex-1 px-6 py-4 rounded-xl border-2 transition-all duration-300 ${
                  selectedMethod === "whatsapp"
                    ? "bg-green-500 border-green-600 text-white shadow-lg"
                    : "bg-white/40 border-white/70 text-gray-700 hover:bg-white/60"
                }`}
              >
                <div className="text-center">
                  <MessageSquare className="w-6 h-6 mx-auto mb-2" />
                  <span className="text-sm">WhatsApp (soon)</span>
                </div>
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setSelectedMethod("telegram")}
                className={`flex-1 px-6 py-4 rounded-xl border-2 transition-all duration-300 ${
                  selectedMethod === "telegram"
                    ? "bg-blue-500 border-blue-600 text-white shadow-lg"
                    : "bg-white/40 border-white/70 text-gray-700 hover:bg-white/60"
                }`}
              >
                <div className="text-center">
                  <Send className="w-6 h-6 mx-auto mb-2" />
                  <span className="text-sm">Telegram (soon)</span>
                </div>
              </motion.button>
            </div>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-6">
            <p className="text-sm text-yellow-800">
              <strong>Note:</strong> SMS is sent only to selected employees.
            </p>
          </div>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleSend}
            disabled={!message || !selectedMethod}
            className={`w-full px-6 py-4 rounded-xl transition-all duration-300 ${
              message && selectedMethod
                ? "bg-gradient-to-r from-red-500 to-red-600 text-white shadow-lg hover:shadow-red-500/60"
                : "bg-gray-300 text-gray-500 cursor-not-allowed"
            }`}
          >
            Send Message
          </motion.button>
        </GlassCard>

        <GlassCard className="mt-6">
          <h3 className="text-lg text-black mb-4">Recent Messages</h3>
          <div className="space-y-3">
            {[
              { date: "2026-05-02 14:30", method: "WhatsApp", status: "Delivered", recipients: 45 },
              { date: "2026-05-01 10:15", method: "Telegram", status: "Delivered", recipients: 32 },
              { date: "2026-04-30 16:45", method: "WhatsApp", status: "Delivered", recipients: 28 },
            ].map((msg, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: index * 0.1 }}
                className="p-4 rounded-lg bg-white/40 border border-white/60 hover:bg-white/60 transition-all"
              >
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm text-black">
                      <strong>{msg.method}</strong> - {msg.recipients} recipients
                    </p>
                    <p className="text-xs text-gray-600">{msg.date}</p>
                  </div>
                  <span className="px-3 py-1 rounded-full bg-green-100 text-green-700 text-xs border border-green-300">
                    {msg.status}
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
        </GlassCard>
      </motion.div>
    </div>
  );
}
