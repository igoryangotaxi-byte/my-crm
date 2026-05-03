import { useState } from "react";
import { motion } from "motion/react";
import { Calculator, MapPin, DollarSign } from "lucide-react";
import { GlassCard } from "./GlassCard";

export function PriceCalculator() {
  const [formData, setFormData] = useState({
    from: "",
    to: "",
    distance: "",
    duration: "",
  });

  const [calculatedPrice, setCalculatedPrice] = useState<number | null>(null);

  const handleCalculate = () => {
    // Simple price calculation logic
    const basePrice = 50;
    const distancePrice = parseFloat(formData.distance) * 2.5;
    const durationPrice = parseFloat(formData.duration) * 1.2;
    const total = basePrice + distancePrice + durationPrice;
    setCalculatedPrice(total);
  };

  return (
    <div className="p-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-3xl"
      >
        <div className="mb-6">
          <h2 className="text-3xl text-black mb-2">Price Calculator</h2>
          <p className="text-gray-700">Calculate estimated ride costs</p>
        </div>

        <GlassCard>
          <div className="space-y-6">
            <div>
              <label className="block text-gray-700 text-sm mb-2">Pick-up Location</label>
              <div className="relative">
                <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-600" />
                <input
                  type="text"
                  value={formData.from}
                  onChange={(e) => setFormData({ ...formData, from: e.target.value })}
                  className="w-full pl-12 pr-4 py-3 rounded-xl bg-white/50 border border-white/70 text-black placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500/60 focus:border-red-500/60 transition-all backdrop-blur-xl"
                  placeholder="Enter pick-up address"
                />
              </div>
            </div>

            <div>
              <label className="block text-gray-700 text-sm mb-2">Drop-off Location</label>
              <div className="relative">
                <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-600" />
                <input
                  type="text"
                  value={formData.to}
                  onChange={(e) => setFormData({ ...formData, to: e.target.value })}
                  className="w-full pl-12 pr-4 py-3 rounded-xl bg-white/50 border border-white/70 text-black placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500/60 focus:border-red-500/60 transition-all backdrop-blur-xl"
                  placeholder="Enter drop-off address"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-gray-700 text-sm mb-2">Distance (km)</label>
                <input
                  type="number"
                  value={formData.distance}
                  onChange={(e) => setFormData({ ...formData, distance: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl bg-white/50 border border-white/70 text-black placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500/60 focus:border-red-500/60 transition-all backdrop-blur-xl"
                  placeholder="0"
                />
              </div>

              <div>
                <label className="block text-gray-700 text-sm mb-2">Duration (min)</label>
                <input
                  type="number"
                  value={formData.duration}
                  onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl bg-white/50 border border-white/70 text-black placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500/60 focus:border-red-500/60 transition-all backdrop-blur-xl"
                  placeholder="0"
                />
              </div>
            </div>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleCalculate}
              className="w-full px-6 py-4 rounded-xl bg-gradient-to-r from-red-500 to-red-600 text-white shadow-lg hover:shadow-red-500/60 transition-all duration-300 flex items-center justify-center gap-2"
            >
              <Calculator className="w-5 h-5" />
              Calculate Price
            </motion.button>

            {calculatedPrice !== null && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3 }}
              >
                <GlassCard className="bg-gradient-to-br from-green-50 to-emerald-50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center">
                        <DollarSign className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Estimated Price</p>
                        <p className="text-3xl text-black">₪{calculatedPrice.toFixed(2)}</p>
                      </div>
                    </div>
                  </div>
                </GlassCard>
              </motion.div>
            )}
          </div>
        </GlassCard>

        <GlassCard className="mt-6">
          <h3 className="text-lg text-black mb-4">Pricing Breakdown</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center p-3 rounded-lg bg-white/40">
              <span className="text-gray-700">Base fare</span>
              <span className="text-black">₪50.00</span>
            </div>
            <div className="flex justify-between items-center p-3 rounded-lg bg-white/40">
              <span className="text-gray-700">Per kilometer</span>
              <span className="text-black">₪2.50</span>
            </div>
            <div className="flex justify-between items-center p-3 rounded-lg bg-white/40">
              <span className="text-gray-700">Per minute</span>
              <span className="text-black">₪1.20</span>
            </div>
          </div>
        </GlassCard>
      </motion.div>
    </div>
  );
}
