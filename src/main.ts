const app: HTMLDivElement = document.querySelector("#app")!;

const button: HTMLButtonElement = document.createElement("button");
button.textContent = "boopadooop";
button.addEventListener("click", () => {
  alert("you clicked the button!");
});
app.append(button);
