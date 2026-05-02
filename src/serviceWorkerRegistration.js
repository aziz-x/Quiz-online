// src/serviceWorkerRegistration.js

export function register() {
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker
          .register(`${import.meta.env.BASE_URL}sw.js`)
          .then(registration => {
            console.log("Service Worker registered with scope:", registration.scope);
          })
          .catch(error => {
            console.error("Service Worker registration failed:", error);
          });
      });
    }
  }
  
  export function unregister() {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.ready
        .then(registration => registration.unregister())
        .catch(error => console.error(error));
    }
  }
  