
const dateInput = document.getElementById("date");
const slotsContainer = document.getElementById("slots");
const selectedTimeInput = document.getElementById("selectedTime");

function getTodayLocal() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

if (dateInput) {
  dateInput.min = getTodayLocal();
  dateInput.addEventListener("change", loadSlots);
}

// LOAD BOOKING SLOTS
async function loadSlots() {
  if (!dateInput || !slotsContainer || !selectedTimeInput) return;

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
    const response = await fetch(
      `/api/slots?date=${encodeURIComponent(date)}`
    );

    if (!response.ok) throw new Error("Unable to load slots");

    const slots = await response.json();

    slotsContainer.innerHTML = "";

    if (!Array.isArray(slots) || slots.length === 0) {
      slotsContainer.innerHTML =
        '<div class="slot-message">No slots available.</div>';
      return;
    }

    slots.forEach((slot) => {
      const button = document.createElement("button");

      button.type = "button";
      button.className = "slot";
      button.textContent = slot.available
        ? slot.time
        : `${slot.time} - Full`;

      if (!slot.available) {
        button.classList.add("disabled");
        button.disabled = true;
      } else {
        button.addEventListener("click", () => {
          document.querySelectorAll(".slot").forEach((item) => {
            item.classList.remove("selected");
          });

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

// APPOINTMENT BOOKING
const appointmentForm = document.getElementById("appointmentForm");

if (appointmentForm) {
  appointmentForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const name = document.getElementById("name").value.trim();
    const phone = document.getElementById("phone").value.trim();
    const service = document.getElementById("service").value;
    const date = document.getElementById("date").value;
    const time = document.getElementById("selectedTime").value;

    if (!time) {
      alert("Please select a time slot.");
      return;
    }

    if (!/^[6-9]\d{9}$/.test(phone)) {
      alert("Please enter a valid 10-digit Indian mobile number.");
      return;
    }

    const submitButton =
      appointmentForm.querySelector("button[type='submit']");

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "Booking...";
    }

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
        return;
      }

      // Use the submitted phone if the server omits it.
      const appointment = {
        ...data.appointment,
        phone: data.appointment?.phone || phone
      };

      showSuccessModal(appointment);

      appointmentForm.reset();
      selectedTimeInput.value = "";

      slotsContainer.innerHTML =
        '<div class="slot-message">Please select a date first.</div>';

    } catch (error) {
      console.error(error);
      alert("Something went wrong. Please try again.");
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = "Confirm Appointment →";
      }
    }
  });
}

// BOOKING SUCCESS MODAL
function showSuccessModal(appointment) {
  const modal = document.getElementById("successModal");
  const details = document.getElementById("appointmentDetails");
  const whatsappButton = document.getElementById("whatsappButton");

  if (!modal || !details) return;

  details.innerHTML = "";

  const fields = [
    ["Token", appointment.token],
    ["Name", appointment.name],
    ["Service", appointment.service],
    ["Date", formatDate(appointment.date)],
    ["Time", appointment.time]
  ];

  fields.forEach(([label, value]) => {
    const div = document.createElement("div");
    const strong = document.createElement("strong");

    strong.textContent = `${label}: `;
    div.appendChild(strong);
    div.appendChild(document.createTextNode(value || ""));
    details.appendChild(div);
  });

  const message = `Namaste ${appointment.name}!

Ridham eMitra mein aapki appointment successfully book ho gayi hai.

Token: ${appointment.token}
Name: ${appointment.name}
Service: ${appointment.service}
Date: ${formatDate(appointment.date)}
Time: ${appointment.time}

Address:
Palwas Chauraha, Bikaner Bypass,
Sikar, Rajasthan

Dhanyavaad!
Ridham eMitra`;

  // Customer's own WhatsApp number
  const phone = String(appointment.phone || "").replace(/\D/g, "");

  const whatsappNumber =
    phone.length === 10 ? `91${phone}` : phone;

  if (whatsappButton) {
    whatsappButton.href =
      `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;

    whatsappButton.target = "_blank";
    whatsappButton.rel = "noopener noreferrer";
    whatsappButton.textContent = "Send Confirmation on WhatsApp";

    whatsappButton.style.display =
      /^91[6-9]\d{9}$/.test(whatsappNumber) ? "" : "none";
  }

  modal.classList.add("show");
}

function closeModal() {
  const modal = document.getElementById("successModal");

  if (modal) {
    modal.classList.remove("show");
  }
}

function formatDate(dateString) {
  if (!dateString) return "";

  const date = new Date(dateString + "T00:00:00");

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "long",
    year: "numeric"
  });
}

// SEARCH APPOINTMENT
async function searchAppointment() {
  const input = document.getElementById("searchValue");
  const result = document.getElementById("searchResult");

  if (!input || !result) return;

  const value = input.value.trim();

  if (!value) {
    result.textContent = "Please enter your token or mobile number.";
    return;
  }

  result.textContent = "Searching...";

  try {
    let url;

    if (/^RDM-/i.test(value)) {
      url =
        `/api/appointments/search?token=${encodeURIComponent(value)}`;
    } else {
      url =
        `/api/appointments/search?phone=${encodeURIComponent(value)}`;
    }

    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      result.textContent = data.error || "Appointment not found.";
      return;
    }

    result.innerHTML = "";

    const card = document.createElement("div");
    card.className = "result-card";

    const fields = [
      ["Token", data.token],
      ["Name", data.name],
      ["Service", data.service],
      ["Date", formatDate(data.date)],
      ["Time", data.time],
      ["Status", data.status]
    ];

    fields.forEach(([label, value]) => {
      const p = document.createElement("p");
      const strong = document.createElement("strong");

      strong.textContent = `${label}: `;
      p.appendChild(strong);
      p.appendChild(document.createTextNode(value || ""));
      card.appendChild(p);
    });

    result.appendChild(card);

  } catch (error) {
    console.error(error);
    result.textContent = "Unable to search appointment.";
  }
}

// CLOSE MODAL WHEN CLICKING OUTSIDE
window.addEventListener("click", (event) => {
  const modal = document.getElementById("successModal");

  if (modal && event.target === modal) {
    closeModal();
  }
});
