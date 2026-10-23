import { initializeApp } from 'firebase/app'
import { GoogleAuthProvider, getAuth, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth'
import { addDoc, collection, getFirestore, onSnapshot, orderBy, query, serverTimestamp } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}
const firebaseConfigured = Object.values(firebaseConfig).every(Boolean)
const app = firebaseConfigured ? initializeApp(firebaseConfig) : null
const auth = app ? getAuth(app) : null
const db = app ? getFirestore(app) : null
const googleProvider = new GoogleAuthProvider()

const quantityInput = document.getElementById('quantity');
      const fleetRows = document.getElementById('fleet-rows');
      const resultContent = document.getElementById('result-content');
      const resultEmpty = document.getElementById('result-empty');
      const totalOutput = document.getElementById('total');
      const statusOutput = document.getElementById('status');
      const musicModal = document.getElementById('music-modal');
      const musicFrame = document.getElementById('music-frame');
      const taylorButton = document.getElementById('taylor-button');
      const saveButton = document.getElementById('save-calculation');
      const saveStatus = document.getElementById('save-status');
      const historyList = document.getElementById('history-list');
      const authPage = document.getElementById('auth-page');
      const appShell = document.getElementById('app-shell');
      const authMessage = document.getElementById('auth-message');
      const signInButton = document.getElementById('google-sign-in');
      const signOutButton = document.getElementById('sign-out');
      const userName = document.getElementById('user-name');
      const userAvatar = document.getElementById('user-avatar');
      let currentUser = null;
      let stopHistoryListener = null;
      let previousTotal = null;
      let latestCalculation = null;

      // La reproducción inicia solo después del clic explícito del usuario.
      function openMusic() {
        musicModal.hidden = false;
        musicFrame.src = 'https://www.youtube-nocookie.com/embed/nfWlot6h_JM?autoplay=1&rel=0&playsinline=1';
        document.getElementById('music-close').focus();
      }

      function closeMusic() {
        musicModal.hidden = true;
        musicFrame.src = '';
        taylorButton.focus();
      }

      taylorButton.addEventListener('click', openMusic);
      document.getElementById('music-close').addEventListener('click', closeMusic);
      musicModal.addEventListener('click', (event) => { if (event.target === musicModal) closeMusic(); });
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !musicModal.hidden) closeMusic();
      });

      const format = (value) => value.toLocaleString('es-AR');

      // Crea un renglón editable para un grupo homogéneo de carros.
      function addFleetRow({ count = '', capacity = '', area = '' } = {}) {
        const row = document.createElement('div');
        row.className = 'fleet-row';
        row.innerHTML = `
          <label class="qty-cell"><span class="sr-only">Cantidad de carros</span><input class="fleet-count" type="number" inputmode="numeric" min="0" step="1" placeholder="0" value="${count}" aria-label="Cantidad de carros"></label>
          <label><span class="sr-only">Capacidad por carro</span><input class="fleet-capacity" type="number" inputmode="numeric" min="1" step="1" placeholder="8" value="${capacity}" aria-label="Capacidad por carro en piezas"></label>
          <label><span class="sr-only">Área de la compañía</span><input class="fleet-area" type="text" maxlength="40" placeholder="Ej. Almacén" value="${area}" aria-label="Área de la compañía"></label>
          <button class="remove-row" type="button" aria-label="Quitar grupo de carros"><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M5 5l10 10M15 5 5 15" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg></button>`;
        row.querySelectorAll('input').forEach((input) => input.addEventListener('input', update));
        row.querySelector('.remove-row').addEventListener('click', () => {
          row.remove();
          update();
        });
        fleetRows.append(row);
        update();
      }

      // Lee filas válidas e ignora grupos vacíos o incompletos mientras se editan.
      function readFleet() {
        const groups = [];
        let hasInvalid = false;
        for (const row of fleetRows.querySelectorAll('.fleet-row')) {
          const countInput = row.querySelector('.fleet-count');
          const capacityInput = row.querySelector('.fleet-capacity');
          const areaInput = row.querySelector('.fleet-area');
          const countRaw = countInput.value.trim();
          const capacityRaw = capacityInput.value.trim();
          const area = areaInput.value.trim();
          const count = Number(countRaw);
          const capacity = Number(capacityRaw);
          const rowHasValue = countRaw !== '' || capacityRaw !== '' || area !== '';
          const valid = countRaw !== '' && capacityRaw !== '' && Number.isSafeInteger(count) && count >= 0 && Number.isSafeInteger(capacity) && capacity > 0 && area !== '';
          countInput.classList.toggle('invalid', countRaw !== '' && (!Number.isSafeInteger(count) || count < 0));
          capacityInput.classList.toggle('invalid', capacityRaw !== '' && (!Number.isSafeInteger(capacity) || capacity <= 0));
          areaInput.classList.toggle('invalid', rowHasValue && area === '');
          if (!rowHasValue) continue;
          if (!valid) { hasInvalid = true; continue; }
          if (count > 0) groups.push({ count, capacity, area });
        }
        return { groups, hasInvalid };
      }

      function showEmpty(message) {
        resultContent.hidden = true;
        resultEmpty.style.display = 'block';
        resultEmpty.textContent = message;
        latestCalculation = null;
        saveButton.disabled = true;
      }

      // Reparte el lote en carros de mayor capacidad primero. El último carro puede ir parcial.
      function update() {
        const quantityRaw = quantityInput.value.trim();
        const quantity = Number(quantityRaw);
        const quantityValid = quantityRaw !== '' && Number.isSafeInteger(quantity) && quantity > 0;
        quantityInput.classList.toggle('invalid', quantityRaw !== '' && !quantityValid);
        document.getElementById('quantity-hint').classList.toggle('error', quantityRaw !== '' && !quantityValid);
        const { groups, hasInvalid } = readFleet();

        if (!quantityValid) {
          showEmpty(quantityRaw ? 'La cantidad de piezas debe ser un número entero mayor a cero.' : 'Ingresá la cantidad de piezas para ver cuántos carros y qué áreas hacen falta.');
          return;
        }
        if (hasInvalid) {
          showEmpty('Completá cada grupo con una cantidad, capacidad y área válidas para actualizar la asignación.');
          return;
        }

        resultContent.hidden = false;
        resultEmpty.style.display = 'none';
        const ordered = [...groups].sort((a, b) => b.capacity - a.capacity);
        const fleetCapacity = groups.reduce((sum, group) => sum + group.count * group.capacity, 0);
        const allocations = [];
        let remaining = quantity;
        let cartsAssigned = 0;
        let piecesAssigned = 0;
        let capacityAssigned = 0;

        for (const group of ordered) {
          if (remaining <= 0) break;
          const neededHere = Math.min(group.count, Math.ceil(remaining / group.capacity));
          if (neededHere <= 0) continue;
          const groupCapacity = neededHere * group.capacity;
          const loadedHere = Math.min(remaining, groupCapacity);
          allocations.push({ ...group, carts: neededHere, pieces: loadedHere, free: groupCapacity - loadedHere });
          cartsAssigned += neededHere;
          piecesAssigned += loadedHere;
          capacityAssigned += groupCapacity;
          remaining -= loadedHere;
        }

        const unassigned = quantity - piecesAssigned;
        const freeSpace = capacityAssigned - piecesAssigned;
        latestCalculation = {
          quantity,
          groups,
          result: { cartsAssigned, piecesAssigned, unassigned, fleetCapacity, freeSpace },
          allocations,
        };
        saveButton.disabled = !currentUser;
        totalOutput.textContent = format(cartsAssigned);
        document.getElementById('pieces-assigned').textContent = format(piecesAssigned);
        document.getElementById('pieces-unassigned').textContent = format(unassigned);
        document.getElementById('capacity-total').textContent = format(fleetCapacity);
        document.getElementById('free-space').textContent = format(freeSpace);
        statusOutput.className = `status ${unassigned === 0 ? 'ok' : groups.length ? 'warn' : 'neutral'}`;
        statusOutput.textContent = unassigned === 0 ? 'Flota suficiente' : groups.length ? `Faltan ${format(unassigned)} piezas por ubicar` : 'Agregá carros disponibles';
        document.getElementById('result-caption').textContent = unassigned === 0
          ? `${format(quantity)} piezas distribuidas en ${format(cartsAssigned)} carros de ${allocations.length} grupo${allocations.length === 1 ? '' : 's'}.`
          : `${format(piecesAssigned)} de ${format(quantity)} piezas se pueden trasladar con los carros cargados.`;

        const allocationList = document.getElementById('allocation-list');
        allocationList.replaceChildren();
        if (allocations.length === 0) {
          const none = document.createElement('div');
          none.className = 'allocation';
          none.textContent = 'Todavía no hay carros asignados.';
          allocationList.append(none);
        }
        allocations.forEach((allocation) => {
          const item = document.createElement('div');
          item.className = 'allocation';
          const details = document.createElement('div');
          const area = document.createElement('div');
          area.className = 'allocation-area';
          area.textContent = allocation.area;
          const detail = document.createElement('div');
          detail.className = 'allocation-detail';
          detail.textContent = `${format(allocation.capacity)} piezas por carro · ${format(allocation.pieces)} piezas asignadas`;
          details.append(area, detail);
          const count = document.createElement('div');
          count.className = 'allocation-count';
          count.textContent = `${format(allocation.carts)} ${allocation.carts === 1 ? 'carro' : 'carros'}`;
          const free = document.createElement('small');
          free.textContent = `${format(allocation.free)} libres`;
          count.append(free);
          item.append(details, count);
          allocationList.append(item);
        });

        if (previousTotal !== cartsAssigned) {
          totalOutput.classList.remove('bump');
          void totalOutput.offsetWidth;
          totalOutput.classList.add('bump');
        }
        previousTotal = cartsAssigned;
      }

      function renderHistoryEntry(data) {
        const entry = document.createElement('article');
        entry.className = 'history-entry';
        const head = document.createElement('div');
        head.className = 'history-entry-head';
        const name = document.createElement('span');
        name.className = 'history-name';
        name.textContent = 'Estimación';
        const date = document.createElement('time');
        date.className = 'history-date';
        const dateValue = data.createdAt?.toDate?.();
        date.textContent = dateValue ? new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short' }).format(dateValue) : 'Fecha no disponible';
        head.append(name, date);
        const summary = document.createElement('div');
        summary.className = 'history-summary';
        summary.textContent = `${format(data.quantity)} piezas solicitadas · ${format(data.result?.cartsAssigned ?? 0)} carros asignados · ${format(data.result?.piecesAssigned ?? 0)} piezas ubicadas · ${format(data.result?.unassigned ?? 0)} sin asignar · capacidad disponible: ${format(data.result?.fleetCapacity ?? 0)} · espacio libre asignado: ${format(data.result?.freeSpace ?? 0)}`;
        const fleet = document.createElement('div');
        fleet.className = 'history-groups';
        fleet.textContent = `Flota ingresada: ${(data.groups || []).length
          ? data.groups.map(({ count, capacity, area }) => `${format(count)} × ${format(capacity)} piezas · ${area}`).join(' / ')
          : 'sin carros'}`;
        const allocations = document.createElement('div');
        allocations.className = 'history-groups';
        allocations.textContent = (data.allocations || []).length
          ? data.allocations.map(({ area, carts, capacity, pieces }) => `${area}: ${format(carts)} ${carts === 1 ? 'carro' : 'carros'} de ${format(capacity)} piezas, ${format(pieces)} asignadas`).join(' · ')
          : 'Sin carros asignados';
        entry.append(head, summary, fleet, allocations);
        return entry;
      }

      async function saveCalculation() {
        if (!latestCalculation) {
          saveStatus.textContent = 'Completá los datos válidos antes de guardar.';
          return;
        }
        if (!currentUser) {
          saveStatus.textContent = 'Iniciá sesión con Google para guardar tu estimación.';
          return;
        }

        saveButton.disabled = true;
        saveStatus.textContent = 'Guardando cálculo…';
        try {
          await addDoc(collection(db, 'users', currentUser.uid, 'estimates'), {
            quantity: latestCalculation.quantity,
            groups: latestCalculation.groups,
            result: latestCalculation.result,
            allocations: latestCalculation.allocations,
            createdAt: serverTimestamp(),
          });
          saveStatus.textContent = 'Estimación guardada en tu cuenta.';
        } catch (error) {
          console.error('No se pudo guardar el cálculo:', error);
          saveStatus.textContent = 'No se pudo guardar. Verificá tu sesión y las reglas de Firestore.';
        } finally {
          saveButton.disabled = !currentUser || !latestCalculation;
        }
      }

      saveButton.addEventListener('click', saveCalculation);
      function listenToEstimates(user) {
        stopHistoryListener?.();
        const userEstimates = collection(db, 'users', user.uid, 'estimates');
        const estimatesQuery = query(userEstimates, orderBy('createdAt', 'desc'));
        stopHistoryListener = onSnapshot(estimatesQuery, (snapshot) => {
          historyList.replaceChildren();
          if (snapshot.empty) {
            historyList.append(Object.assign(document.createElement('div'), { className: 'history-message', textContent: 'Todavía no guardaste estimaciones.' }));
            return;
          }
          snapshot.forEach((documentSnapshot) => historyList.append(renderHistoryEntry(documentSnapshot.data())));
        }, (error) => {
          console.error('No se pudo leer el historial:', error);
          historyList.replaceChildren(Object.assign(document.createElement('div'), {
            className: 'history-message',
            textContent: 'No se pudieron cargar tus estimaciones. Verificá las reglas de acceso de tu cuenta.',
          }));
        });
      }

      signInButton.addEventListener('click', async () => {
        signInButton.disabled = true;
        authMessage.textContent = 'Abriendo Google…';
        try {
          await signInWithPopup(auth, googleProvider);
        } catch (error) {
          console.error('No se pudo iniciar sesión con Google:', error);
          if (error.code === 'auth/popup-closed-by-user') {
            authMessage.textContent = 'Se cerró la ventana de Google antes de completar el ingreso.';
          } else if (error.code === 'auth/unauthorized-domain') {
            authMessage.textContent = 'Agregá este dominio en Firebase Authentication → Settings → Authorized domains.';
          } else if (error.code === 'auth/operation-not-allowed') {
            authMessage.textContent = 'Habilitá Google en Firebase Authentication → Sign-in method.';
          } else {
            authMessage.textContent = 'No se pudo iniciar sesión. Revisá la configuración de Google en Firebase Authentication.';
          }
          signInButton.disabled = false;
        }
      });

      signOutButton.addEventListener('click', async () => {
        try {
          await signOut(auth);
        } catch (error) {
          console.error('No se pudo cerrar la sesión:', error);
          saveStatus.textContent = 'No se pudo cerrar la sesión. Intentá nuevamente.';
        }
      });

      if (!firebaseConfigured) {
        signInButton.disabled = true;
        authMessage.textContent = 'Completá las variables VITE_FIREBASE_* y reiniciá el servidor.';
      } else {
        onAuthStateChanged(auth, (user) => {
          currentUser = user;
          if (!user) {
            stopHistoryListener?.();
            stopHistoryListener = null;
            appShell.hidden = true;
            authPage.hidden = false;
            signInButton.disabled = false;
            userName.textContent = '';
            userAvatar.hidden = true;
            historyList.replaceChildren(Object.assign(document.createElement('div'), {
              className: 'history-message',
              textContent: 'Iniciá sesión para consultar tus estimaciones.',
            }));
            saveButton.disabled = true;
            return;
          }

          authPage.hidden = true;
          appShell.hidden = false;
          userName.textContent = user.displayName || user.email || 'Mi cuenta';
          userAvatar.src = user.photoURL || '';
          userAvatar.hidden = !user.photoURL;
          authMessage.textContent = '';
          saveButton.disabled = !latestCalculation;
          listenToEstimates(user);
        }, (error) => {
          console.error('Error al comprobar la sesión:', error);
          authPage.hidden = false;
          appShell.hidden = true;
          authMessage.textContent = 'No se pudo validar la sesión. Revisá la configuración de Firebase Authentication.';
        });
      }

      document.getElementById('add-row').addEventListener('click', () => addFleetRow({ count: 1, capacity: 8, area: '' }));
      document.getElementById('clear-button').addEventListener('click', () => {
        quantityInput.value = '';
        fleetRows.replaceChildren();
        previousTotal = null;
        addFleetRow();
        quantityInput.focus();
      });

      // Ejemplo editable: 3 carros de 5 en Almacén y 2 de 9 en Producción.
      addFleetRow({ count: 3, capacity: 5, area: 'Almacén' });
      addFleetRow({ count: 2, capacity: 9, area: 'Producción' });
