const USERNAME = process.env.GH_USERNAME || "Sekiro825";
const TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;

async function fetchGraphql() {
  if (!TOKEN) return null;
  try {
    const query = `
      query($username: String!) {
        user(login: $username) {
          contributionsCollection {
            contributionCalendar {
              totalContributions
              weeks {
                contributionDays {
                  color
                  contributionCount
                  date
                  weekday
                }
              }
            }
          }
        }
      }
    `;
    const res = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: {
        "Authorization": `bearer ${TOKEN}`,
        "User-Agent": "NodeJS-Snake-Generator"
      },
      body: JSON.stringify({ query, variables: { username: USERNAME } })
    });
    if (res.ok) {
      const data = await res.json();
      const calendar = data?.data?.user?.contributionsCollection?.contributionCalendar;
      if (calendar) {
        console.log("GraphQL fetch successful!");
        return calendar;
      }
    }
  } catch (e) {
    console.warn("GraphQL error:", e.message);
  }
  return null;
}

async function testFetch() {
  const gqlData = await fetchGraphql();
  console.log("GQL Data available?", !!gqlData);
}

testFetch();
