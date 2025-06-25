import React from "react";
import { ExtensionProvider, useExtension } from "../contexts/ExtensionContext";
import ViewRouter from "./ViewRouter";

// Internal App component that uses the context
const AppContent: React.FC = () => {
  const { state } = useExtension();

  return (
    <div className="app">
      <ViewRouter currentView={state.currentView} />
    </div>
  );
};

// Main App component that provides the context
const App: React.FC = () => {
  return (
    <ExtensionProvider>
      <AppContent />
    </ExtensionProvider>
  );
};

export default App;
