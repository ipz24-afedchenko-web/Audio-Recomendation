import { Outlet } from "react-router-dom";
import Navbar from "./Navbar";
import GlobalPlayer from "./GlobalPlayer";
import { usePlayer } from "../context/PlayerContext";

export default function AppLayout() {
  const { currentTrack } = usePlayer();
  return (
    <div className="min-h-[100dvh]">
      <Navbar />
      <main className={currentTrack ? "pb-32" : "pb-12"}>
        <div className="mx-auto max-w-7xl px-4 py-6">
          <Outlet />
        </div>
      </main>
      <GlobalPlayer />
    </div>
  );
}
