const dateInput = document.getElementById("date");
const slotsContainer = document.getElementById("slots");
const selectedTimeInput = document.getElementById("selectedTime");

const today = new Date().toISOString().split("T")[0];

if (dateInput) {
  dateInput.min = today;

  dateInput.addEventListener("change", loadSlots);
}


async function loadSlots() {

  const date = dateInput.value;

  if (!date) {
    slotsContainer.innerHTML =
      '<div class="slot-message">Please select a date first.</div>';

    return;
  }

  slotsContainer.innerHTML =
    '<div class="slot-message">Loading available slots...</div>';

  selectedTimeInput.value = "";

  try {

    const response = await fetch(`/api/slots?date=${date}`);
    const slots = await response.json();

    slotsContainer.innerHTML = "";

    slots.forEach(slot => {

      const button = document.createElement("button");

      button.type = "button";
      button.className = "slot";

      button.textContent =
        slot.available
          ? `${slot.time}`
          : `${slot.time} - Full`;

      if (!slot.available) {
        button.classList.add("disabled");
        button.disabled = true;
      }

      if (slot.available) {

        button.addEventListener("click", () => {

          document
            .querySelectorAll(".slot")
            .forEach(item => item.classList.remove("selected"));

          button.classList.add("selected");

          selectedTimeInput.value = slot.time;

        });

      }

      slotsContainer.appendChild(button);

    });

  } catch (error) {

    console.error(error);

    slotsContainer.innerHTML =
      '<div class="slot-message">Unable to load slots.</div>';

  }
}


// APPOINTMENT FORM

const appointmentForm =
  document.getElementById("appointmentForm");

if (appointmentForm) {

  appointmentForm.addEventListener("submit", async (event) => {

    event.preventDefault();

    const name =
      document.getElementById("name").value.trim();

    const phone =
      document.getElementById("phone").value.trim();

    const service =
      document.getElementById("service").value;

    const date =
      document.getElementById("date").value;

    const time =
      document.getElementById("selectedTime").value;


    if (!time) {

      alert("Please select a time slot.");

      return;
    }


    const submitButton =
      appointmentForm.querySelector("button[type='submit']");

    submitButton.disabled = true;
    submitButton.textContent = "Booking...";


    try {

      const response = await fetch("/api/appointments", {

        method: "POST",

        headers: {
          "Content-Type": "application/json"
        },

        body: JSON.stringify({
          name,
          phone,
          service,
          date,
          time
        })

      });


      const data = await response.json();


      if (!response.ok) {

        alert(data.error || "Unable to book appointment.");

        submitButton.disabled = false;
        submitButton.textContent = "Confirm Appointment →";

        return;
      }


      showSuccessModal(data.appointment);

      appointmentForm.reset();

      selectedTimeInput.value = "";

      slotsContainer.innerHTML =
        '<div class="slot-message">Please select a date first.</div>';

    } catch (error) {

      console.error(error);

      alert("Something went wrong. Please try again.");

    }


    submitButton.disabled = false;
    submitButton.textContent = "Confirm Appointment →";

  });

}


// SUCCESS MODAL

function showSuccessModal(appointment) {

  const modal =
    document.getElementById("successModal");

  const details =
    document.getElementById("appointmentDetails");

  details.innerHTML = `

    <div><strong>Token:</strong> ${appointment.token}</div>

    <div><strong>Name:</strong> ${appointment.name}</div>

    <div><strong>Service:</strong> ${appointment.service}</div>

    <div><strong>Date:</strong> ${formatDate(appointment.date)}</div>

    <div><strong>Time:</strong> ${appointment.time}</div>

  `;


  const message =

`Hello Ridham eMitra,

My appointment has been booked successfully.

Token: ${appointment.token}
Name: ${appointment.name}
Service: ${appointment.service}
Date: ${formatDate(appointment.date)}
Time: ${appointment.time}

Thank you.`;


  const whatsappUrl =
    `https://wa.me/919785421306?text=${encodeURIComponent(message)}`;


  document.getElementById("whatsappButton").href =
    whatsappUrl;


  modal.classList.add("show");

}


function closeModal() {

  document
    .getElementById("successModal")
    .classList.remove("show");

}


function formatDate(dateString) {

  const date = new Date(dateString + "T00:00:00");

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "long",
    year: "numeric"
  });

}


// SEARCH APPOINTMENT

async function searchAppointment() {

  const value =
    document.getElementById("searchValue").value.trim();

  const result =
    document.getElementById("searchResult");


  if (!value) {

    result.innerHTML =
      '<div class="result-error">Please enter your token or mobile number.</div>';

    return;
  }


  result.innerHTML =
    "<p>Searching...</p>";


  try {

    let url;

    if (/^RDM-/i.test(value)) {

      url =
        `/api/appointments/search?token=${encodeURIComponent(value)}`;

    } else {

      url =
        `/api/appointments/search?phone=${encodeURIComponent(value)}`;

    }


    const response =
      await fetch(url);

    const data =
      await response.json();


    if (!response.ok) {

      result.innerHTML =
        `<div class="result-error">${data.error}</div>`;

      return;
    }


    result.innerHTML = `

      <div class="result-card">

        <p>
          <strong>Token:</strong>
          ${data.token}
        </p>

        <p>
          <strong>Name:</strong>
          ${data.name}
        </p>

        <p>
          <strong>Service:</strong>
          ${data.service}
        </p>

        <p>
          <strong>Date:</strong>
          ${formatDate(data.date)}
        </p>

        <p>
          <strong>Time:</strong>
          ${data.time}
        </p>

        <p>
          <strong>Status:</strong>
          ${data.status}
        </p>

      </div>

    `;

  } catch (error) {

    console.error(error);

    result.innerHTML =
      '<div class="result-error">Unable to search appointment.</div>';

  }

}


// CLOSE MODAL WHEN CLICKING OUTSIDE

window.addEventListener("click", (event) => {

  const modal =
    document.getElementById("successModal");

  if (event.target === modal) {
    closeModal();
  }

});