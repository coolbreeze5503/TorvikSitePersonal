import { supabase } from "@/lib/supabase";

export default async function Home() {
  const { data: teams, error } = await supabase
    .from("team_stats")
    .select("team_id, barthag, adj_o, adj_d, teams(team_name, conference)")
    .order("barthag", { ascending: false })
    .limit(10);

  return (
    <div className="min-h-screen bg-black text-white p-8 font-sans">
      <h1 className="text-3xl font-bold mb-2">Torvik Site — Supabase connection check</h1>
      <p className="text-zinc-400 mb-6">Top 10 teams by Barthag, read live from Supabase.</p>

      {error && (
        <p className="text-red-500">Error: {error.message}</p>
      )}

      {teams && (
        <table className="border-collapse">
          <thead>
            <tr className="text-left border-b border-zinc-700">
              <th className="pr-6 py-1">Team</th>
              <th className="pr-6 py-1">Conf</th>
              <th className="pr-6 py-1">Barthag</th>
              <th className="pr-6 py-1">AdjO</th>
              <th className="pr-6 py-1">AdjD</th>
            </tr>
          </thead>
          <tbody>
            {teams.map((t) => {
              const team = Array.isArray(t.teams) ? t.teams[0] : t.teams;
              return (
                <tr key={t.team_id} className="border-b border-zinc-800">
                  <td className="pr-6 py-1">{team?.team_name}</td>
                  <td className="pr-6 py-1">{team?.conference}</td>
                  <td className="pr-6 py-1">{Number(t.barthag).toFixed(4)}</td>
                  <td className="pr-6 py-1">{t.adj_o}</td>
                  <td className="pr-6 py-1">{t.adj_d}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
