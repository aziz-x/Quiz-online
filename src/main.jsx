import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { HashRouter } from 'react-router-dom'
import AdminContextProvider from './context/AdminContext.jsx'
import DoctorContextProvider from './context/DoctorContext.jsx'
import AppContextProvider from './context/AppContext.jsx'
import ThemeContextProvider from './context/ThemeContext.jsx'
import { register } from "./serviceWorkerRegistration.js";

createRoot(document.getElementById('root')).render(
  <HashRouter>
    <ThemeContextProvider>
      <AdminContextProvider>
        <DoctorContextProvider>
          <AppContextProvider>
            <App />
          </AppContextProvider>
        </DoctorContextProvider>
      </AdminContextProvider>
    </ThemeContextProvider>
  </HashRouter>
)
register();
