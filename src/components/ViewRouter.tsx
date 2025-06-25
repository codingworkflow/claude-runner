import React from "react";
import { ViewType } from "../contexts/ExtensionContext";
import MainView from "./views/MainView";
import CommandsView from "./views/CommandsView";
import UsageView from "./views/UsageView";

interface ViewRouterProps {
  currentView: ViewType;
}

const ViewRouter: React.FC<ViewRouterProps> = ({ currentView }) => {
  switch (currentView) {
    case "main":
      return <MainView />;
    case "commands":
      return <CommandsView />;
    case "usage":
      return <UsageView />;
    default:
      return <MainView />;
  }
};

export default ViewRouter;
