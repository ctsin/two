import { useAppSelector } from "./hooks/store";
import { LoginScreen } from "./components/LoginScreen";
import { Sidebar } from "./components/Sidebar";
import { ChatView } from "./components/ChatView";
import { MessageSquare } from "lucide-react";

function Shell() {
  const currentId = useAppSelector((s) => s.conversations.currentId);

  return (
    <div className="h-screen flex overflow-hidden bg-background">
      <Sidebar />
      <main className="flex-1 flex min-w-0">
        {currentId ? (
          <ChatView conversationId={currentId} />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <MessageSquare className="h-10 w-10 opacity-30" />
            <p className="text-sm">Select a conversation to start chatting</p>
          </div>
        )}
      </main>
    </div>
  );
}

export default function App() {
  const token = useAppSelector((s) => s.auth.token);
  return token ? <Shell /> : <LoginScreen />;
}
