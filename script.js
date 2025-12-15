const backendURL = "https://lms-backend-jwi8.onrender.com";

const loadCoursesBtn = document.getElementById("loadCourses");
const courseList = document.getElementById("courseList");
const lessonList = document.getElementById("lessonList");
const paperList = document.getElementById("paperList");

loadCoursesBtn.addEventListener("click", loadCourses);

/* Load Courses */
async function loadCourses() {
  courseList.innerHTML = "";
  lessonList.innerHTML = "";
  loadPapers();

  const res = await fetch(`${backendURL}/courses`);
  const courses = await res.json();

  courses.forEach(course => {
    const li = document.createElement("li");
    li.textContent = course.title;
    li.onclick = () => loadLessons(course._id);
    courseList.appendChild(li);
  });
}

/* Load Lessons */
async function loadLessons(courseId) {
  lessonList.innerHTML = "";

  const res = await fetch(`${backendURL}/lessons/course/${courseId}`);
  const lessons = await res.json();

  lessons.forEach(lesson => {
    const card = document.createElement("div");
    card.className = "lesson-card";

    const title = document.createElement("h3");
    title.textContent = lesson.title;

    const content = document.createElement("p");
    content.textContent = lesson.content || "No description";

    card.appendChild(title);
    card.appendChild(content);

    lessonList.appendChild(card);
  });
}

/* Load Question Papers */
function loadPapers() {
  paperList.innerHTML = `
    <li><a href="papers/2025 JEE Adv paper 1.pdf" target="_blank">JEE Advanced 2025 – Paper 1</a></li>
    <li><a href="papers/2025 JEE Adv paper 2.pdf" target="_blank">JEE Advanced 2025 – Paper 2</a></li>
    <li><a href="papers/2024 JEE Adv paper 1.pdf" target="_blank">JEE Advanced 2024 – Paper 1</a></li>
    <li><a href="papers/2024 JEE Adv paper 2.pdf" target="_blank">JEE Advanced 2024 – Paper 2</a></li>
  `;
}






