// process-games.js
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CRICAPI_KEY = process.env.CRICAPI_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !CRICAPI_KEY) {
  throw new Error("Missing required environment variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRICAPI_KEY");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  try {
    // Generate current time in the same format as your database (YYYY-MM-DDTHH:MM:SS)
    const now = new Date().toISOString().split('.')[0];

    // Query match_results table for games that have occurred and have not ended.
    const { data: games, error } = await supabase
      .from("match_results")
      .select("api_id, name")
      .lt("api_date_time", now)
      .eq("matchEnded", false);

    if (error) {
      console.error("Error fetching games:", error);
      return res.status(500).json({ error: error.message });
    }

    // Process each game.
    for (const game of games) {
      const gameApiId = game.api_id;
      console.log("processing game ", game.name);
      try {
        // Build the CricAPI URL.
        const apiUrl = `https://api.cricapi.com/v1/match_info?apikey=${CRICAPI_KEY}&id=${gameApiId}`;
        const response = await fetch(apiUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          }
        });

        if (!response.ok) {
          console.error(`Error fetching result for game ${gameApiId}: ${response.statusText}`);
          continue; // Skip to the next game if API call fails.
        }

        const resultData = await response.json();
        // Extract the game status from the API response.
        const result = resultData.data ? resultData.data : null;
        console.log(result);
        if (!result) {
          console.error(`No result found for game ${gameApiId}`);
          continue;
        }
        console.log("Game status: ", result.status);
        // Only proceed if the match has ended.
        if (result.matchEnded === true) {
          console.log("Updating game ", game.name);
          // Update the game record with the fetched result.
          const { error: updateError } = await supabase
            .from("match_results")
            .update({
              summary: result.status,
              matchEnded: true,
              matchStarted: true
            })
            .eq("api_id", gameApiId);

          if (updateError) {
            console.error(`Failed to update game ${gameApiId}:`, updateError);
          }
        }
      } catch (err) {
        console.error(`Error fetching data for game ${gameApiId}:`, err);
        continue;
      }
    }

    return res.status(200).json({
      message: "Processed games successfully",
      processed: games.length
    });
  } catch (err) {
    console.error("Unhandled error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
