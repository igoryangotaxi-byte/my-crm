import { Outlet, NavLink, useLocation } from "react-router";
import { Car, Package, Sparkles, ClipboardList, MessageSquare, BarChart3, Calculator, Settings } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";

export function Layout() {
  const [isSidebarHovered, setIsSidebarHovered] = useState(false);
  const location = useLocation();
  const isRequestRidesPage = location.pathname === "/";

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-100 via-gray-200 to-gray-100 overflow-hidden relative">
      {/* Animated background bubbles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute w-96 h-96 bg-red-500/15 rounded-full blur-3xl"
          animate={{
            x: [0, 100, 0],
            y: [0, -100, 0],
          }}
          transition={{
            duration: 20,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          style={{ top: "10%", left: "10%" }}
        />
        <motion.div
          className="absolute w-80 h-80 bg-red-400/20 rounded-full blur-3xl"
          animate={{
            x: [0, -80, 0],
            y: [0, 80, 0],
          }}
          transition={{
            duration: 15,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          style={{ bottom: "20%", right: "15%" }}
        />
        <motion.div
          className="absolute w-64 h-64 bg-gray-300/20 rounded-full blur-3xl"
          animate={{
            x: [0, 60, 0],
            y: [0, -60, 0],
          }}
          transition={{
            duration: 18,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          style={{ top: "50%", right: "30%" }}
        />
      </div>

      <div className="flex h-screen relative z-10">
        {/* Glassmorphism Sidebar */}
        <motion.aside
          initial={{ x: -100, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          onHoverStart={() => setIsSidebarHovered(true)}
          onHoverEnd={() => setIsSidebarHovered(false)}
          className="fixed w-16 hover:w-64 p-5 backdrop-blur-3xl bg-white/30 border-r border-white/40 rounded-r-3xl shadow-2xl shadow-black/10 overflow-y-auto overflow-x-hidden transition-all duration-300 z-50 h-screen"
        >
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center shadow-lg shadow-red-500/60 flex-shrink-0">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div className="whitespace-nowrap overflow-hidden">
              <h1 className="text-lg text-black">RideFlow</h1>
              <p className="text-xs text-gray-600">B2B CRM</p>
            </div>
          </div>

          <nav className="space-y-2">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `group flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${
                  isActive
                    ? "bg-gradient-to-r from-red-500 to-red-600 text-white shadow-lg shadow-red-500/60"
                    : "text-gray-700 hover:bg-white/50"
                }`
              }
            >
              {({ isActive }) => (
                <motion.div
                  className="flex items-center gap-3 w-full whitespace-nowrap overflow-hidden"
                  whileHover={{ x: 4 }}
                  transition={{ duration: 0.2 }}
                >
                  <Car className="w-5 h-5 flex-shrink-0" />
                  <span className="text-sm">Request Rides</span>
                </motion.div>
              )}
            </NavLink>

            <NavLink
              to="/pre-orders"
              className={({ isActive }) =>
                `group flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${
                  isActive
                    ? "bg-gradient-to-r from-red-500 to-red-600 text-white shadow-lg shadow-red-500/60"
                    : "text-gray-700 hover:bg-white/50"
                }`
              }
            >
              {({ isActive }) => (
                <motion.div
                  className="flex items-center gap-3 w-full whitespace-nowrap overflow-hidden"
                  whileHover={{ x: 4 }}
                  transition={{ duration: 0.2 }}
                >
                  <ClipboardList className="w-5 h-5 flex-shrink-0" />
                  <span className="text-sm">Pre-Orders</span>
                </motion.div>
              )}
            </NavLink>

            <NavLink
              to="/orders"
              className={({ isActive }) =>
                `group flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${
                  isActive
                    ? "bg-gradient-to-r from-red-500 to-red-600 text-white shadow-lg shadow-red-500/60"
                    : "text-gray-700 hover:bg-white/50"
                }`
              }
            >
              {({ isActive }) => (
                <motion.div
                  className="flex items-center gap-3 w-full whitespace-nowrap overflow-hidden"
                  whileHover={{ x: 4 }}
                  transition={{ duration: 0.2 }}
                >
                  <Package className="w-5 h-5 flex-shrink-0" />
                  <span className="text-sm">Orders</span>
                </motion.div>
              )}
            </NavLink>

            <NavLink
              to="/communications"
              className={({ isActive }) =>
                `group flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${
                  isActive
                    ? "bg-gradient-to-r from-red-500 to-red-600 text-white shadow-lg shadow-red-500/60"
                    : "text-gray-700 hover:bg-white/50"
                }`
              }
            >
              {({ isActive }) => (
                <motion.div
                  className="flex items-center gap-3 w-full whitespace-nowrap overflow-hidden"
                  whileHover={{ x: 4 }}
                  transition={{ duration: 0.2 }}
                >
                  <MessageSquare className="w-5 h-5 flex-shrink-0" />
                  <span className="text-sm">Communications</span>
                </motion.div>
              )}
            </NavLink>

            <NavLink
              to="/price-calculator"
              className={({ isActive }) =>
                `group flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${
                  isActive
                    ? "bg-gradient-to-r from-red-500 to-red-600 text-white shadow-lg shadow-red-500/60"
                    : "text-gray-700 hover:bg-white/50"
                }`
              }
            >
              {({ isActive }) => (
                <motion.div
                  className="flex items-center gap-3 w-full whitespace-nowrap overflow-hidden"
                  whileHover={{ x: 4 }}
                  transition={{ duration: 0.2 }}
                >
                  <Calculator className="w-5 h-5 flex-shrink-0" />
                  <span className="text-sm">Price Calculator</span>
                </motion.div>
              )}
            </NavLink>

            <NavLink
              to="/dashboard"
              className={({ isActive }) =>
                `group flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${
                  isActive
                    ? "bg-gradient-to-r from-red-500 to-red-600 text-white shadow-lg shadow-red-500/60"
                    : "text-gray-700 hover:bg-white/50"
                }`
              }
            >
              {({ isActive }) => (
                <motion.div
                  className="flex items-center gap-3 w-full whitespace-nowrap overflow-hidden"
                  whileHover={{ x: 4 }}
                  transition={{ duration: 0.2 }}
                >
                  <BarChart3 className="w-5 h-5 flex-shrink-0" />
                  <span className="text-sm">Dashboard</span>
                </motion.div>
              )}
            </NavLink>

            <div className="pt-4 mt-4 border-t border-white/30">
              <NavLink
                to="/access-management"
                className={({ isActive }) =>
                  `group flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${
                    isActive
                      ? "bg-gradient-to-r from-red-500 to-red-600 text-white shadow-lg shadow-red-500/60"
                      : "text-gray-700 hover:bg-white/50"
                  }`
                }
              >
                {({ isActive }) => (
                  <motion.div
                    className="flex items-center gap-3 w-full whitespace-nowrap overflow-hidden"
                    whileHover={{ x: 4 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Settings className="w-5 h-5 flex-shrink-0" />
                    <span className="text-sm">Access Management</span>
                  </motion.div>
                )}
              </NavLink>
            </div>
          </nav>

          <div className="absolute bottom-5 left-5 right-5">
            <motion.div
              whileHover={{ scale: 1.02 }}
              className="p-3 rounded-xl bg-white/30 backdrop-blur-xl border border-white/50 shadow-lg"
            >
              <p className="text-xs text-gray-600">2026 Edition</p>
              <p className="text-xs text-black mt-1">Premium</p>
            </motion.div>
          </div>
        </motion.aside>

        {/* Main Content */}
        <main className={`flex-1 overflow-auto ${isRequestRidesPage ? "" : "ml-16"}`}>
          <Outlet context={{ isSidebarHovered }} />
        </main>
      </div>
    </div>
  );
}
