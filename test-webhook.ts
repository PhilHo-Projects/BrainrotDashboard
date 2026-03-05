const SECRET = "123";

const testData = [
    {
        videoId: "dQw4w9WgXcQ",
        title: "Rick Astley - Never Gonna Give You Up (Official Music Video)",
        channelName: "Rick Astley",
        thumbnail: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg"
    },
    {
        videoId: "jNQXAC9IVRw",
        title: "Me at the zoo",
        channelName: "jawed",
        thumbnail: "https://i.ytimg.com/vi/jNQXAC9IVRw/hqdefault.jpg"
    },
    {
        videoId: "LXb3EKWsInQ",
        title: "Costa Rica in 4K 60fps",
        channelName: "Jacob and Katie Schwarz",
        thumbnail: "https://i.ytimg.com/vi/LXb3EKWsInQ/hqdefault.jpg"
    }
];

console.log("Sending test push to YouTube Webhook...");

fetch("http://localhost:4321/api/webhook/youtube", {
    method: "POST",
    headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SECRET}`
    },
    body: JSON.stringify(testData)
})
    .then(res => res.json())
    .then(data => {
        console.log("Server Response:", data);
    })
    .catch(err => console.error(err));
