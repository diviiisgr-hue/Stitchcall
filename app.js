// ========================================
// STITCHCALL - MAIN APPLICATION
// ========================================

// 1. SUPABASE SETTINGS
// உங்கள் Supabase Project URL மற்றும் anon/publishable key-ஐ மட்டும் இடவும்.
// service_role key-ஐ ஒருபோதும் இங்கே பயன்படுத்த வேண்டாம்.

const SUPABASE_URL = "YOUR_SUPABASE_PROJECT_URL";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

// 2. GLOBAL VARIABLES

let currentUser = null;
let currentProfile = null;
let selectedTailor = null;

// 3. PAGE NAVIGATION

function showView(viewId) {
  document.querySelectorAll(".view").forEach(view => {
    view.classList.add("hidden");
  });

  const selectedView = document.getElementById(viewId);

  if (selectedView) {
    selectedView.classList.remove("hidden");
  }

  window.scrollTo(0, 0);
}

// 4. MESSAGE DISPLAY

function showMessage(elementId, message, success = false) {
  const element = document.getElementById(elementId);

  if (!element) return;

  element.textContent = message;
  element.style.color = success ? "green" : "red";
}

function showToast(message) {
  const toast = document.getElementById("toast");

  if (!toast) return;

  toast.textContent = message;
  toast.classList.remove("hidden");

  setTimeout(() => {
    toast.classList.add("hidden");
  }, 3000);
}

// 5. SIGNUP / LOGIN MODE

function toggleSignup(isSignup) {
  const roleWrap = document.getElementById("signupRoleWrap");

  if (roleWrap) {
    roleWrap.classList.toggle("hidden", !isSignup);
  }

  const button = document.querySelector("#authForm button[type='submit']");

  if (button) {
    button.textContent = isSignup ? "Create Account" : "Login";
  }
}

// 6. AUTHENTICATION

document.getElementById("authForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  const email = document.getElementById("authEmail").value.trim();
  const password = document.getElementById("authPassword").value;
  const role = document.getElementById("signupRole")?.value || "customer";

  showMessage("authMessage", "Please wait...");

  let result;

  const isSignup = document.querySelector("#signupRoleWrap") &&
    !document.getElementById("signupRoleWrap").classList.contains("hidden");

  if (isSignup) {
    result = await supabaseClient.auth.signUp({
      email,
      password,
      options: {
        data: {
          requested_role: role === "tailor" ? "tailor" : "customer"
        }
      }
    });
  } else {
    result = await supabaseClient.auth.signInWithPassword({
      email,
      password
    });
  }

  if (result.error) {
    showMessage("authMessage", result.error.message);
    return;
  }

  if (isSignup && !result.data.session) {
    showMessage(
      "authMessage",
      "Account created! Please verify your email before logging in.",
      true
    );
    return;
  }

  currentUser = result.data.user;

  await refreshSession();

  showMessage("authMessage", "Success!", true);
});

// 7. SESSION CHECK

async function refreshSession() {
  const { data, error } = await supabaseClient.auth.getSession();

  if (error || !data.session) {
    currentUser = null;
    currentProfile = null;
    return;
  }

  currentUser = data.session.user;

  const { data: profile, error: profileError } =
    await supabaseClient
      .from("sc_profiles")
      .select("*")
      .eq("id", currentUser.id)
      .single();

  if (profileError) {
    console.error(profileError);
    showToast("Profile could not be loaded.");
    return;
  }

  currentProfile = profile;

  updateNavigation();
  showView("homeView");
}

// 8. NAVIGATION BUTTONS

function updateNavigation() {
  const login = document.getElementById("navLogin");
  const join = document.getElementById("navJoin");
  const dashboard = document.getElementById("navDashboard");
  const logoutButton = document.getElementById("navLogout");

  const loggedIn = !!currentUser;

  if (login) login.classList.toggle("hidden", loggedIn);
  if (join) join.classList.toggle("hidden", loggedIn);
  if (dashboard) dashboard.classList.toggle("hidden", !loggedIn);
  if (logoutButton) logoutButton.classList.toggle("hidden", !loggedIn);
}

document.getElementById("navLogin")?.addEventListener("click", () => {
  toggleSignup(false);
  showView("authView");
});

document.getElementById("navJoin")?.addEventListener("click", () => {
  startTailorSignup();
});

document.getElementById("navDashboard")?.addEventListener("click", () => {
  loadDashboard();
});

document.getElementById("navLogout")?.addEventListener("click", logout);

// 9. TAILOR SIGNUP

function startTailorSignup() {
  if (!currentUser) {
    toggleSignup(true);
    showView("authView");
    showToast("Create a customer account first, then apply as a tailor.");
    return;
  }

  showView("applyView");
}

// 10. TAILOR APPLICATION

document.getElementById("applyForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  if (!currentUser) {
    showToast("Please login first.");
    return;
  }

  const application = {
    owner_id: currentUser.id,
    business_type: document.getElementById("businessType").value,
    display_name: document.getElementById("businessName").value.trim(),
    owner_name: document.getElementById("ownerName").value.trim(),
    area: document.getElementById("area").value.trim(),
    phone: document.getElementById("phone").value.trim(),
    services: document.getElementById("services").value.trim(),
    starting_price: Number(document.getElementById("startingPrice").value),
    description: document.getElementById("description").value.trim(),
    status: "pending"
  };

  if (!application.display_name || !application.owner_name ||
      !application.area || !application.phone) {
    showMessage("applyMessage", "Please fill all required fields.");
    return;
  }

  showMessage("applyMessage", "Submitting application...");

  const { error } = await supabaseClient
    .from("sc_tailors")
    .insert(application);

  if (error) {
    showMessage("applyMessage", error.message);
    return;
  }

  showMessage(
    "applyMessage",
    "Application submitted! Admin approval is required before listing.",
    true
  );

  document.getElementById("applyForm").reset();
});

// 11. LOAD APPROVED TAILORS

async function renderTailors(searchText = "") {
  const list = document.getElementById("tailorList");

  if (!list) return;

  list.innerHTML = "<p>Loading tailors...</p>";

  let query = supabaseClient
    .from("sc_tailors")
    .select("*")
    .eq("status", "approved")
    .order("created_at", { ascending: false });

  if (searchText) {
    query = query.or(
      `display_name.ilike.%${searchText}%,area.ilike.%${searchText}%`
    );
  }

  const { data, error } = await query;

  if (error) {
    list.innerHTML = "<p>Unable to load tailors.</p>";
    console.error(error);
    return;
  }

  if (!data || data.length === 0) {
    list.innerHTML = "<p>No approved tailors available yet.</p>";
    return;
  }

  list.innerHTML = data.map(tailor => `
    <div class="tailor-card">
      <h3>${escapeHTML(tailor.display_name)}</h3>
      <p>📍 ${escapeHTML(tailor.area)}</p>
      <p>Starting from ₹${Number(tailor.starting_price || 0)}</p>
      <p>${escapeHTML(tailor.services || "")}</p>
      <button onclick="openTailor('${tailor.id}')">
        View Details
      </button>
    </div>
  `).join("");
}

// 12. SEARCH

document.getElementById("searchInput")?.addEventListener("input", event => {
  renderTailors(event.target.value.trim());
});

// 13. TAILOR DETAILS

async function openTailor(tailorId) {
  const { data, error } = await supabaseClient
    .from("sc_tailors")
    .select("*")
    .eq("id", tailorId)
    .eq("status", "approved")
    .single();

  if (error || !data) {
    showToast("Tailor not found.");
    return;
  }

  selectedTailor = data;

  const detail = document.getElementById("tailorDetail");

  detail.innerHTML = `
    <h2>${escapeHTML(data.display_name)}</h2>
    <p><strong>Owner:</strong> ${escapeHTML(data.owner_name)}</p>
    <p><strong>Area:</strong> ${escapeHTML(data.area)}</p>
    <p><strong>Services:</strong> ${escapeHTML(data.services || "")}</p>
    <p><strong>Starting price:</strong> ₹${Number(data.starting_price || 0)}</p>
    <p>${escapeHTML(data.description || "")}</p>
    <button onclick="createBooking('${data.id}')">
      Request Booking
    </button>
    <p>Booking is only a request until the tailor confirms it.</p>
  `;

  showView("detailView");
}

// 14. CUSTOMER BOOKING REQUEST

async function createBooking(tailorId) {
  if (!currentUser) {
    showToast("Please login to request a booking.");
    toggleSignup(false);
    showView("authView");
    return;
  }

  if (currentProfile?.role !== "customer") {
    showToast("Only customer accounts can request bookings.");
    return;
  }

  const dressType = prompt("Enter dress type:");
  if (!dressType || !dressType.trim()) return;

  const description = prompt("Enter stitching requirements:");
  if (description === null) return;

  const amountInput = prompt("Enter estimated amount in ₹:");
  if (amountInput === null) return;

  const amount = Number(amountInput);

  if (!Number.isFinite(amount) || amount <= 0) {
    showToast("Please enter a valid amount.");
    return;
  }

  const { error } = await supabaseClient
    .from("sc_bookings")
    .insert({
      customer_id: currentUser.id,
      tailor_id: tailorId,
      dress_type: dressType.trim(),
      description: description.trim(),
      amount: amount,
      status: "requested"
    });

  if (error) {
    showToast("Booking request failed: " + error.message);
    return;
  }

  showToast("Booking request submitted. Wait for tailor confirmation.");
  showView("homeView");
}

// 15. DASHBOARD

async function loadDashboard() {
  await refreshSession();

  if (!currentUser || !currentProfile) {
    showToast("Please login first.");
    return;
  }

  const title = document.getElementById("dashboardTitle");
  const content = document.getElementById("dashboardContent");

  showView("dashboardView");

  if (currentProfile.role === "admin") {
    title.textContent = "Admin Dashboard";
    await loadAdminDashboard(content);
  } else if (currentProfile.role === "tailor") {
    title.textContent = "Tailor Dashboard";
    await loadTailorDashboard(content);
  } else {
    title.textContent = "Customer Dashboard";
    await loadCustomerDashboard(content);
  }
}

// 16. ADMIN DASHBOARD

async function loadAdminDashboard(content) {
  const { data: applications, error: appError } =
    await supabaseClient
      .from("sc_tailors")
      .select("*")
      .order("created_at", { ascending: false });

  const { data: bookings, error: bookingError } =
    await supabaseClient
      .from("sc_bookings")
      .select("*")
      .order("created_at", { ascending: false });

  if (appError || bookingError) {
    content.innerHTML = "<p>Unable to load admin data.</p>";
    return;
  }

  content.innerHTML = `
    <h3>Tailor Applications</h3>
    ${applications.map(item => `
      <div class="dashboard-card">
        <h4>${escapeHTML(item.display_name)}</h4>
        <p>${escapeHTML(item.area)}</p>
        <p>Status: ${escapeHTML(item.status)}</p>
        ${item.status === "pending" ? `
          <button onclick="updateTailorStatus('${item.id}','approved')">
            Approve
          </button>
          <button onclick="updateTailorStatus('${item.id}','rejected')">
            Reject
          </button>
        ` : ""}
      </div>
    `).join("")}

    <h3>All Bookings</h3>
    ${bookings.map(booking => `
      <div class="dashboard-card">
        <p>Dress: ${escapeHTML(booking.dress_type)}</p>
        <p>Amount: ₹${Number(booking.amount || 0)}</p>
        <p>Status: ${escapeHTML(booking.status)}</p>
        <p>Commission (10% on completed orders only): ₹${
          booking.status === "completed"
            ? (Number(booking.amount || 0) * 0.10).toFixed(2)
            : "0.00"
        }</p>
      </div>
    `).join("")}
  `;
}

// 17. APPROVE / REJECT TAILOR

async function updateTailorStatus(tailorId, status) {
  if (!["approved", "rejected"].includes(status)) return;

  const { error } = await supabaseClient
    .from("sc_tailors")
    .update({ status })
    .eq("id", tailorId);

  if (error) {
    showToast("Unable to update: " + error.message);
    return;
  }

  showToast("Tailor application updated.");
  loadDashboard();
}

// 18. TAILOR DASHBOARD

async function loadTailorDashboard(content) {
  const { data: tailor, error } = await supabaseClient
    .from("sc_tailors")
    .select("*")
    .eq("owner_id", currentUser.id)
    .maybeSingle();

  if (error) {
    content.innerHTML = "<p>Unable to load your tailor profile.</p>";
    return;
  }

  if (!tailor) {
    content.innerHTML = `
      <p>You have not submitted a tailor application.</p>
      <button onclick="startTailorSignup()">Apply Now</button>
    `;
    return;
  }

  const { data: bookings, error: bookingError } =
    await supabaseClient
      .from("sc_bookings")
      .select("*")
      .eq("tailor_id", tailor.id)
      .order("created_at", { ascending: false });

  if (bookingError) {
    content.innerHTML = "<p>Unable to load bookings.</p>";
    return;
  }

  const completed = bookings.filter(b => b.status === "completed");

  const earnings = completed.reduce(
    (total, booking) => total + Number(booking.amount || 0),
    0
  );

  const commission = earnings * 0.10;

  content.innerHTML = `
    <div class="dashboard-card">
      <h3>${escapeHTML(tailor.display_name)}</h3>
      <p>Application status: ${escapeHTML(tailor.status)}</p>
      <p>Total completed order value: ₹${earnings.toFixed(2)}</p>
      <p>StitchCall commission (10%): ₹${commission.toFixed(2)}</p>
    </div>

    <h3>Your Bookings</h3>

    ${bookings.map(booking => `
      <div class="dashboard-card">
        <p>Dress: ${escapeHTML(booking.dress_type)}</p>
        <p>Amount: ₹${Number(booking.amount || 0)}</p>
        <p>Status: ${escapeHTML(booking.status)}</p>

        ${["requested", "confirmed", "in_progress"].includes(booking.status) ? `
          <button onclick="changeBookingStatus('${booking.id}','confirmed')">
            Confirm
          </button>
          <button onclick="changeBookingStatus('${booking.id}','in_progress')">
            Start Stitching
          </button>
          <button onclick="changeBookingStatus('${booking.id}','completed')">
            Mark Completed
          </button>
        ` : ""}
      </div>
    `).join("")}
  `;
}

// 19. UPDATE BOOKING STATUS

async function changeBookingStatus(bookingId, status) {
  const allowed = ["confirmed", "in_progress", "completed"];

  if (!allowed.includes(status)) return;

  const { error } = await supabaseClient
    .from("sc_bookings")
    .update({ status })
    .eq("id", bookingId);

  if (error) {
    showToast("Unable to update booking: " + error.message);
    return;
  }

  showToast("Booking status updated.");
  loadDashboard();
}

// 20. CUSTOMER DASHBOARD

async function loadCustomerDashboard(content) {
  const { data: bookings, error } = await supabaseClient
    .from("sc_bookings")
    .select("*")
    .eq("customer_id", currentUser.id)
    .order("created_at", { ascending: false });

  if (error) {
    content.innerHTML = "<p>Unable to load bookings.</p>";
    return;
  }

  content.innerHTML = `
    <h3>My Booking Requests</h3>

    ${bookings.length ? bookings.map(booking => `
      <div class="dashboard-card">
        <p>Dress: ${escapeHTML(booking.dress_type)}</p>
        <p>Amount: ₹${Number(booking.amount || 0)}</p>
        <p>Status: ${escapeHTML(booking.status)}</p>
      </div>
    `).join("") : "<p>You have no booking requests yet.</p>"}
  `;
}

// 21. LOGOUT

async function logout() {
  await supabaseClient.auth.signOut();

  currentUser = null;
  currentProfile = null;

  updateNavigation();
  showView("homeView");
  showToast("Logged out successfully.");
}

// 22. SAFE HTML DISPLAY

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => {
    const replacements = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    };

    return replacements[character];
  });
}

// 23. INITIAL STARTUP

document.addEventListener("DOMContentLoaded", async () => {
  updateNavigation();

  await refreshSession();

  await renderTailors();
});

supabaseClient.auth.onAuthStateChange(() => {
  setTimeout(async () => {
    await refreshSession();
    await renderTailors();
  }, 0);
});
