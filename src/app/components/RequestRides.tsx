import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Phone, MapPin, Plus, ChevronDown, Clock } from "lucide-react";
import { useOutletContext } from "react-router";

interface RouteStop {
  id: string;
  address: string;
  phone: string;
}

interface RequestedRide {
  id: string;
  scheduled: boolean;
  scheduledTime?: string;
  route: string;
  orderId: string;
  phone: string;
  client: string;
}

export function RequestRides() {
  const { isSidebarHovered } = useOutletContext<{ isSidebarHovered: boolean }>() || { isSidebarHovered: false };

  const [expandedBlocks, setExpandedBlocks] = useState({
    client: true,
    route: false,
    settings: false,
    mapActions: false,
  });

  const [formData, setFormData] = useState({
    client: "",
    riderPhone: "",
    pickupLocation: "",
    destination: "",
    passengerPhone: "",
    tariffClass: "comfortplus_b2b",
    driverInstructions: "",
    scheduleRide: false,
    scheduleDateTime: "",
  });

  const [routeStops, setRouteStops] = useState<RouteStop[]>([]);
  const [requestedRides, setRequestedRides] = useState<RequestedRide[]>([]);

  const clients = [
    "Select Client",
    "COFIK (COFIK)",
    "Optidev (OPTIDEV)",
    "SHAMKO (SHAMKO)",
    "SHLAV (SHLAV)",
    "SHUFERSHAL (SHUFERSHAL)",
    "Star Taxi Point",
  ];

  const toggleBlock = (block: keyof typeof expandedBlocks) => {
    setExpandedBlocks((prev) => ({
      ...prev,
      [block]: !prev[block],
    }));
  };

  const addRouteStop = () => {
    setRouteStops([...routeStops, { id: Date.now().toString(), address: "", phone: "" }]);
  };

  const removeRouteStop = (id: string) => {
    setRouteStops(routeStops.filter((stop) => stop.id !== id));
  };

  const clearRoute = () => {
    setFormData({ ...formData, pickupLocation: "", destination: "", passengerPhone: "" });
    setRouteStops([]);
  };

  const handleRequestRide = () => {
    const newRide: RequestedRide = {
      id: Date.now().toString(),
      scheduled: formData.scheduleRide,
      scheduledTime: formData.scheduleDateTime,
      route: `${formData.pickupLocation} → ${formData.destination}`,
      orderId: `d${Math.random().toString(36).substr(2, 9)}`,
      phone: formData.passengerPhone,
      client: formData.client,
    };
    setRequestedRides([newRide, ...requestedRides]);
  };

  const removeRide = (id: string) => {
    setRequestedRides(requestedRides.filter((ride) => ride.id !== id));
  };

  return (
    <div className="h-full relative">
      {/* Map Background */}
      <div className="w-full h-full bg-gradient-to-br from-gray-100 via-gray-50 to-gray-100 relative overflow-hidden">
        <svg className="w-full h-full" viewBox="0 0 1000 800" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
              <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#E5E7EB" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" opacity="0.4" />

          <line x1="100" y1="200" x2="900" y2="200" stroke="#CBD5E1" strokeWidth="4" opacity="0.5" />
          <line x1="100" y1="400" x2="900" y2="400" stroke="#CBD5E1" strokeWidth="6" opacity="0.5" />
          <line x1="100" y1="600" x2="900" y2="600" stroke="#CBD5E1" strokeWidth="4" opacity="0.5" />
          <line x1="300" y1="0" x2="300" y2="800" stroke="#CBD5E1" strokeWidth="4" opacity="0.5" />
          <line x1="500" y1="0" x2="500" y2="800" stroke="#CBD5E1" strokeWidth="4" opacity="0.5" />
          <line x1="700" y1="0" x2="700" y2="800" stroke="#CBD5E1" strokeWidth="4" opacity="0.5" />

          <rect x="120" y="220" width="150" height="150" fill="#9CA3AF" opacity="0.15" rx="4" />
          <rect x="320" y="220" width="150" height="150" fill="#9CA3AF" opacity="0.15" rx="4" />
          <rect x="520" y="220" width="150" height="150" fill="#9CA3AF" opacity="0.15" rx="4" />
          <rect x="720" y="220" width="150" height="150" fill="#9CA3AF" opacity="0.15" rx="4" />

          {formData.pickupLocation && (
            <motion.g initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ duration: 0.3 }}>
              <circle cx="350" cy="350" r="12" fill="#10B981" />
              <circle cx="350" cy="350" r="20" fill="none" stroke="#10B981" strokeWidth="2" opacity="0.5" />
              <motion.circle
                cx="350"
                cy="350"
                r="25"
                fill="none"
                stroke="#10B981"
                strokeWidth="2"
                animate={{ scale: [1, 1.5], opacity: [0.5, 0] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            </motion.g>
          )}

          {formData.destination && (
            <motion.g initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ duration: 0.3, delay: 0.2 }}>
              <circle cx="650" cy="450" r="12" fill="#EF4444" />
              <circle cx="650" cy="450" r="20" fill="none" stroke="#EF4444" strokeWidth="2" opacity="0.5" />
              <motion.circle
                cx="650"
                cy="450"
                r="25"
                fill="none"
                stroke="#EF4444"
                strokeWidth="2"
                animate={{ scale: [1, 1.5], opacity: [0.5, 0] }}
                transition={{ duration: 2, repeat: Infinity, delay: 0.5 }}
              />
            </motion.g>
          )}

          {formData.pickupLocation && formData.destination && (
            <motion.path
              d="M 350 350 Q 450 380, 650 450"
              fill="none"
              stroke="#6366F1"
              strokeWidth="3"
              strokeDasharray="8 4"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.5 }}
            />
          )}

          <text x="500" y="30" textAnchor="middle" fill="#6B7280" fontSize="14" fontWeight="bold">
            TEL AVIV
          </text>
        </svg>
      </div>

      {/* Floating Blocks - Left Side */}
      <motion.div
        animate={{ marginLeft: isSidebarHovered ? "280px" : "88px" }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="absolute top-6 space-y-4 z-10 w-96"
      >
        {/* Select Client Block */}
        <motion.div
          whileHover={{ scale: 1.02, y: -2 }}
          className="rounded-3xl bg-white/80 backdrop-blur-2xl border border-white shadow-xl overflow-hidden transition-all duration-300"
        >
          <motion.button
            onClick={() => toggleBlock("client")}
            className="w-full p-5 flex items-center justify-between hover:bg-gradient-to-r hover:from-white/60 hover:to-white/40 transition-all duration-300"
          >
            <span className="text-sm text-gray-700 uppercase tracking-wider font-medium">Select the Client</span>
            <motion.div
              animate={{ rotate: expandedBlocks.client ? 180 : 0 }}
              transition={{ duration: 0.3 }}
            >
              <ChevronDown className="w-5 h-5 text-gray-600" />
            </motion.div>
          </motion.button>

          <AnimatePresence>
            {expandedBlocks.client && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.4, ease: "easeInOut" }}
                className="overflow-hidden"
              >
                <div className="p-5 pt-0 space-y-4">
                  <motion.div whileHover={{ scale: 1.01 }} transition={{ duration: 0.2 }}>
                    <select
                      value={formData.client}
                      onChange={(e) => setFormData({ ...formData, client: e.target.value })}
                      className="w-full px-4 py-3.5 rounded-2xl bg-white/90 backdrop-blur-xl border border-gray-200 text-black appearance-none focus:outline-none focus:ring-2 focus:ring-red-400/50 focus:border-red-400/50 transition-all duration-300 cursor-pointer shadow-sm hover:shadow-md"
                    >
                      {clients.map((client) => (
                        <option key={client} value={client}>
                          {client}
                        </option>
                      ))}
                    </select>
                  </motion.div>

                  <div>
                    <label className="block text-xs text-gray-600 uppercase tracking-wide mb-2 font-medium">
                      Rider Phone
                    </label>
                    <motion.input
                      whileHover={{ scale: 1.01 }}
                      type="tel"
                      value={formData.riderPhone}
                      onChange={(e) => setFormData({ ...formData, riderPhone: e.target.value })}
                      className="w-full px-4 py-3.5 rounded-2xl bg-white/90 backdrop-blur-xl border border-gray-200 text-black placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-400/50 focus:border-red-400/50 transition-all duration-300 shadow-sm hover:shadow-md"
                      placeholder="+972..."
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Route & Stops Block */}
        <motion.div
          whileHover={{ scale: 1.02, y: -2 }}
          className="rounded-3xl bg-white/80 backdrop-blur-2xl border border-white shadow-xl overflow-hidden transition-all duration-300"
        >
          <motion.button
            onClick={() => toggleBlock("route")}
            className="w-full p-5 flex items-center justify-between hover:bg-gradient-to-r hover:from-white/60 hover:to-white/40 transition-all duration-300"
          >
            <span className="text-base text-black font-medium">Route & stops</span>
            <motion.div animate={{ rotate: expandedBlocks.route ? 180 : 0 }} transition={{ duration: 0.3 }}>
              <ChevronDown className="w-5 h-5 text-gray-600" />
            </motion.div>
          </motion.button>

          <AnimatePresence>
            {expandedBlocks.route && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.4, ease: "easeInOut" }}
                className="overflow-hidden"
              >
                <div className="p-5 pt-0 space-y-4">
                  {/* Pickup Location */}
                  <div>
                    <label className="block text-xs text-gray-600 uppercase tracking-wide mb-2 font-medium">
                      Pickup Location
                    </label>
                    <motion.div whileHover={{ scale: 1.01 }} transition={{ duration: 0.2 }} className="relative">
                      <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                      <input
                        type="text"
                        value={formData.pickupLocation}
                        onChange={(e) => setFormData({ ...formData, pickupLocation: e.target.value })}
                        className="w-full pl-12 pr-4 py-3.5 rounded-2xl bg-white/90 backdrop-blur-xl border border-gray-200 text-black placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-400/50 focus:border-red-400/50 transition-all duration-300 shadow-sm hover:shadow-md"
                        placeholder=""
                      />
                    </motion.div>
                  </div>

                  {/* Stops */}
                  <AnimatePresence>
                    {routeStops.map((stop, index) => (
                      <motion.div
                        key={stop.id}
                        initial={{ height: 0, opacity: 0, scale: 0.95 }}
                        animate={{ height: "auto", opacity: 1, scale: 1 }}
                        exit={{ height: 0, opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.3 }}
                        className="space-y-2"
                      >
                        <div className="flex gap-2 items-start">
                          <div className="flex-1 space-y-2">
                            <div>
                              <label className="block text-xs text-gray-600 uppercase tracking-wide mb-2 font-medium">
                                Stop {index + 1} Address
                              </label>
                              <motion.input
                                whileHover={{ scale: 1.01 }}
                                transition={{ duration: 0.2 }}
                                type="text"
                                value={stop.address}
                                onChange={(e) =>
                                  setRouteStops(routeStops.map((s) => (s.id === stop.id ? { ...s, address: e.target.value } : s)))
                                }
                                className="w-full px-4 py-3.5 rounded-2xl bg-white/90 backdrop-blur-xl border border-gray-200 text-black placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-400/50 focus:border-red-400/50 transition-all duration-300 shadow-sm hover:shadow-md"
                                placeholder={`Stop ${index + 1} location`}
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-600 uppercase tracking-wide mb-2 font-medium">
                                Stop {index + 1} Phone (SMS)
                              </label>
                              <motion.input
                                whileHover={{ scale: 1.01 }}
                                transition={{ duration: 0.2 }}
                                type="tel"
                                value={stop.phone}
                                onChange={(e) =>
                                  setRouteStops(routeStops.map((s) => (s.id === stop.id ? { ...s, phone: e.target.value } : s)))
                                }
                                className="w-full px-4 py-3.5 rounded-2xl bg-white/90 backdrop-blur-xl border border-gray-200 text-black placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-400/50 focus:border-red-400/50 transition-all duration-300 shadow-sm hover:shadow-md"
                                placeholder="+972..."
                              />
                            </div>
                          </div>
                          <motion.button
                            whileHover={{ scale: 1.1, rotate: 90 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => removeRouteStop(stop.id)}
                            className="mt-8 w-10 h-10 rounded-xl bg-red-50 hover:bg-red-100 flex items-center justify-center transition-all duration-300 shadow-sm hover:shadow-md flex-shrink-0"
                          >
                            <Plus className="w-5 h-5 text-red-600 rotate-45" />
                          </motion.button>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>

                  {/* Add Stop Button - positioned between stops and destination */}
                  <motion.button
                    whileHover={{ scale: 1.05, y: -2 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={addRouteStop}
                    className="w-full px-4 py-3 rounded-2xl bg-white/90 backdrop-blur-xl border border-gray-200 text-black hover:bg-white transition-all duration-300 shadow-md hover:shadow-lg font-medium flex items-center justify-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Add Stop
                  </motion.button>

                  {/* Destination */}
                  <div>
                    <label className="block text-xs text-gray-600 uppercase tracking-wide mb-2 font-medium">
                      Destination
                    </label>
                    <motion.div whileHover={{ scale: 1.01 }} transition={{ duration: 0.2 }} className="relative">
                      <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                      <input
                        type="text"
                        value={formData.destination}
                        onChange={(e) => setFormData({ ...formData, destination: e.target.value })}
                        className="w-full pl-12 pr-4 py-3.5 rounded-2xl bg-white/90 backdrop-blur-xl border border-gray-200 text-black placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-400/50 focus:border-red-400/50 transition-all duration-300 shadow-sm hover:shadow-md"
                        placeholder=""
                      />
                    </motion.div>
                  </div>

                  <div>
                    <label className="block text-xs text-gray-600 uppercase tracking-wide mb-2 font-medium">
                      Passenger phone at destination (SMS)
                    </label>
                    <motion.input
                      whileHover={{ scale: 1.01 }}
                      transition={{ duration: 0.2 }}
                      type="tel"
                      value={formData.passengerPhone}
                      onChange={(e) => setFormData({ ...formData, passengerPhone: e.target.value })}
                      className="w-full px-4 py-3.5 rounded-2xl bg-white/90 backdrop-blur-xl border border-gray-200 text-black placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-400/50 focus:border-red-400/50 transition-all duration-300 shadow-sm hover:shadow-md"
                      placeholder="+972..."
                    />
                  </div>

                  <div className="flex gap-3">
                    <motion.button
                      whileHover={{ scale: 1.05, y: -2 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={clearRoute}
                      className="flex-1 px-4 py-3 rounded-2xl bg-white/90 backdrop-blur-xl border border-gray-200 text-black hover:bg-white transition-all duration-300 shadow-md hover:shadow-lg font-medium"
                    >
                      Clear route
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Ride Settings Block */}
        <motion.div
          whileHover={{ scale: 1.02, y: -2 }}
          className="rounded-3xl bg-white/80 backdrop-blur-2xl border border-white shadow-xl overflow-hidden transition-all duration-300"
        >
          <motion.button
            onClick={() => toggleBlock("settings")}
            className="w-full p-5 flex items-center justify-between hover:bg-gradient-to-r hover:from-white/60 hover:to-white/40 transition-all duration-300"
          >
            <span className="text-base text-black font-medium">Ride settings</span>
            <motion.div animate={{ rotate: expandedBlocks.settings ? 180 : 0 }} transition={{ duration: 0.3 }}>
              <ChevronDown className="w-5 h-5 text-gray-600" />
            </motion.div>
          </motion.button>

          <AnimatePresence>
            {expandedBlocks.settings && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.4, ease: "easeInOut" }}
                className="overflow-hidden"
              >
                <div className="p-5 pt-0 space-y-4">
                  <div>
                    <label className="block text-xs text-gray-600 uppercase tracking-wide mb-2 font-medium">
                      Tariff Class
                    </label>
                    <motion.input
                      whileHover={{ scale: 1.01 }}
                      transition={{ duration: 0.2 }}
                      type="text"
                      value={formData.tariffClass}
                      onChange={(e) => setFormData({ ...formData, tariffClass: e.target.value })}
                      className="w-full px-4 py-3.5 rounded-2xl bg-white/90 backdrop-blur-xl border border-gray-200 text-black focus:outline-none focus:ring-2 focus:ring-red-400/50 focus:border-red-400/50 transition-all duration-300 shadow-sm hover:shadow-md"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-gray-600 uppercase tracking-wide mb-2 font-medium">
                      Driver instructions...
                    </label>
                    <motion.textarea
                      whileHover={{ scale: 1.01 }}
                      transition={{ duration: 0.2 }}
                      value={formData.driverInstructions}
                      onChange={(e) => setFormData({ ...formData, driverInstructions: e.target.value })}
                      rows={3}
                      className="w-full px-4 py-3.5 rounded-2xl bg-white/90 backdrop-blur-xl border border-gray-200 text-black placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-400/50 focus:border-red-400/50 transition-all duration-300 resize-none shadow-sm hover:shadow-md"
                      placeholder="Main cost center"
                    />
                  </div>

                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="scheduleRide"
                      checked={formData.scheduleRide}
                      onChange={(e) => setFormData({ ...formData, scheduleRide: e.target.checked })}
                      className="w-5 h-5 rounded-md border-2 border-gray-400 bg-white text-red-500 focus:ring-2 focus:ring-red-400/40 cursor-pointer transition-all duration-200"
                    />
                    <label htmlFor="scheduleRide" className="text-sm text-black font-medium cursor-pointer">
                      Schedule ride
                    </label>
                  </div>

                  <AnimatePresence>
                    {formData.scheduleRide && (
                      <motion.div
                        initial={{ height: 0, opacity: 0, scale: 0.95 }}
                        animate={{ height: "auto", opacity: 1, scale: 1 }}
                        exit={{ height: 0, opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.3 }}
                      >
                        <label className="block text-xs text-gray-600 uppercase tracking-wide mb-2 font-medium">
                          Schedule DateTime
                        </label>
                        <motion.input
                          whileHover={{ scale: 1.01 }}
                          transition={{ duration: 0.2 }}
                          type="datetime-local"
                          value={formData.scheduleDateTime}
                          onChange={(e) => setFormData({ ...formData, scheduleDateTime: e.target.value })}
                          className="w-full px-4 py-3.5 rounded-2xl bg-white/90 backdrop-blur-xl border border-gray-200 text-black focus:outline-none focus:ring-2 focus:ring-red-400/50 focus:border-red-400/50 transition-all duration-300 shadow-sm hover:shadow-md"
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Action Buttons */}
        <div className="space-y-3">
          <motion.button
            whileHover={{ scale: 1.03, y: -3, boxShadow: "0 20px 40px rgba(239, 68, 68, 0.4)" }}
            whileTap={{ scale: 0.97 }}
            onClick={handleRequestRide}
            className="w-full px-6 py-4 rounded-2xl bg-gradient-to-br from-red-400 via-red-500 to-red-600 text-white shadow-xl hover:shadow-2xl transition-all duration-300 font-medium text-base relative overflow-hidden"
            style={{
              boxShadow: "0 10px 30px rgba(239, 68, 68, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.3)"
            }}
          >
            <span className="relative z-10">Request ride</span>
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.03, y: -2 }}
            whileTap={{ scale: 0.97 }}
            className="w-full px-6 py-3.5 rounded-2xl bg-white/90 backdrop-blur-xl border border-gray-200 text-black hover:bg-white transition-all duration-300 shadow-md hover:shadow-lg font-medium"
          >
            Check phone registration
          </motion.button>
        </div>

        {/* Map Point Actions Block */}
        <motion.div
          whileHover={{ scale: 1.02, y: -2 }}
          className="rounded-3xl bg-white/80 backdrop-blur-2xl border border-white shadow-xl overflow-hidden transition-all duration-300"
        >
          <motion.button
            onClick={() => toggleBlock("mapActions")}
            className="w-full p-5 flex items-center justify-between hover:bg-gradient-to-r hover:from-white/60 hover:to-white/40 transition-all duration-300"
          >
            <span className="text-base text-black font-medium">Map point actions</span>
            <motion.div animate={{ rotate: expandedBlocks.mapActions ? 180 : 0 }} transition={{ duration: 0.3 }}>
              <ChevronDown className="w-5 h-5 text-gray-600" />
            </motion.div>
          </motion.button>

          <AnimatePresence>
            {expandedBlocks.mapActions && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.4, ease: "easeInOut" }}
                className="overflow-hidden"
              >
                <div className="p-5 pt-0 space-y-3">
                  <p className="text-sm text-black mb-2">Israel</p>
                  <div className="flex gap-2">
                    <motion.button
                      whileHover={{ scale: 1.05, y: -2 }}
                      whileTap={{ scale: 0.98 }}
                      className="flex-1 px-3 py-2.5 rounded-xl bg-white/90 backdrop-blur-xl border border-gray-200 text-sm text-black hover:bg-white transition-all duration-300 shadow-md hover:shadow-lg font-medium"
                    >
                      Set as Pickup location
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.05, y: -2 }}
                      whileTap={{ scale: 0.98 }}
                      className="flex-1 px-3 py-2.5 rounded-xl bg-white/90 backdrop-blur-xl border border-gray-200 text-sm text-black hover:bg-white transition-all duration-300 shadow-md hover:shadow-lg font-medium"
                    >
                      Set as Destination
                    </motion.button>
                  </div>
                  <motion.button
                    whileHover={{ scale: 1.05, y: -2 }}
                    whileTap={{ scale: 0.98 }}
                    className="w-full px-3 py-2.5 rounded-xl bg-white/90 backdrop-blur-xl border border-gray-200 text-sm text-black hover:bg-white transition-all duration-300 shadow-md hover:shadow-lg font-medium"
                  >
                    Add as Stop along the way
                  </motion.button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.div>

      {/* Requested Rides - Top Right */}
      <div className="absolute top-6 right-6 z-10 space-y-3 max-w-sm">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="p-3 rounded-2xl bg-white/90 backdrop-blur-2xl border border-white shadow-lg"
        >
          <h4 className="text-xs text-gray-600 uppercase tracking-wide mb-1 font-medium">Requested Rides</h4>
          <p className="text-xs text-gray-500">
            {requestedRides.length > 0 ? `${requestedRides.length} rides in progress` : "No rides requested yet"}
          </p>
        </motion.div>

        <AnimatePresence>
          {requestedRides.map((ride) => (
            <motion.div
              key={ride.id}
              initial={{ opacity: 0, x: 50, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 50, scale: 0.9 }}
              whileHover={{ scale: 1.02, y: -2 }}
              transition={{ duration: 0.3 }}
              className={`p-4 rounded-2xl backdrop-blur-2xl border border-white shadow-xl hover:shadow-2xl transition-all duration-300 ${
                ride.scheduled ? "bg-white/60" : "bg-white/90"
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Clock className="w-3 h-3 text-blue-500" />
                  <span className="text-xs text-black font-medium">{ride.scheduled ? "Scheduled ride" : "Searching driver"}</span>
                </div>
                <button className="text-blue-500 hover:text-blue-600 text-xs underline transition-colors">
                  Searching driver
                </button>
              </div>

              {ride.scheduled && ride.scheduledTime && (
                <div className="text-xs text-gray-700 mb-2">
                  <p className="mb-1 font-medium">
                    {new Date(ride.scheduledTime).toLocaleString('en-GB', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    }).replace(',', ' at')}
                  </p>
                  <p className="text-gray-500 italic text-xs">We'll start looking for a car in advance and notify you when it's ready</p>
                </div>
              )}

              <p className="text-sm text-black mb-3 font-medium">{ride.route}</p>

              <div className="space-y-1 text-xs text-gray-700">
                <p><span className="text-gray-600">Order:</span> <span className="font-medium">{ride.orderId}</span></p>
                <p><span className="text-gray-600">Phone:</span> <span className="font-medium">{ride.phone}</span></p>
                <p><span className="text-gray-600">Client:</span> <span className="font-medium">{ride.client}</span></p>
              </div>

              <motion.button
                whileHover={{ scale: 1.03, y: -1 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => removeRide(ride.id)}
                className="mt-3 w-full px-3 py-2 rounded-xl bg-red-50 text-red-600 text-xs hover:bg-red-100 transition-all duration-300 font-medium shadow-sm hover:shadow-md"
              >
                Remove/cancel ride
              </motion.button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
