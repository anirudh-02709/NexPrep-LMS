const params = new URLSearchParams(window.location.search);
const chapter = params.get("name");

const chapterSubjects = {
  kinematics: "physics",
  nlm: "physics",
  wpe: "physics",
  rotational: "physics",
  atomicstructure: "chemistry",
  chemicalbonding: "chemistry",
  thermodynamics: "chemistry",
  electrochemistry: "chemistry",
  quadraticequations: "maths",
  sequences: "maths",
  limits: "maths",
  matrices: "maths"
};

// ✅ Guard: if URL has no ?name= param, show fallback instead of crashing
if (!chapter) {
    document.getElementById("chapter-title").innerText = "Chapter not found";
    document.getElementById("videos").innerText = "No chapter was specified. Please go back and select a chapter.";
    // Stop the rest of the script from running
    throw new Error("No chapter param in URL");
}

document.getElementById("chapter-title").innerText = getChapterTitle(chapter);

async function updateLearningProgress() {
  const token = getToken();
  const subject = chapterSubjects[chapter];

  if (!token || !subject) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/progress/update`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        subject,
        chapter
      })
    });

    if (!response.ok) {
      handleUnauthorized();
    }
  } catch (error) {
    handleUnauthorized();
  }
}

updateLearningProgress();

const videoData = {
  kinematics: [
    "https://youtube.com/",
    "https://youtube.com/"
  ],
  atomicstructure: [
    "https://youtube.com/"
  ],
  quadraticequations: [
    "https://youtube.com/"
  ]
};

const videoContainer = document.getElementById("videos");
videoContainer.innerHTML = "";

if (videoData[chapter]) {
  videoData[chapter].forEach(link => {
    const a = document.createElement("a");
    a.href = link;
    a.target = "_blank";
    a.innerText = "Watch Video";
    a.classList.add("video-card");
    videoContainer.appendChild(a);
  });
} else {
  videoContainer.innerText = "No videos available for this chapter.";
}
