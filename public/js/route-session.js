const ROUTE_SESSION_KEY = 'leorbit.routePayload.v2';

function readSessionState() {
    try {
        const raw = sessionStorage.getItem(ROUTE_SESSION_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function writeSessionState(value) {
    sessionStorage.setItem(ROUTE_SESSION_KEY, JSON.stringify(value));
}

export function saveRoutePayload(routePayload) {
    try {
        if (!routePayload) {
            sessionStorage.removeItem(ROUTE_SESSION_KEY);
            return;
        }

        const existingState = readSessionState();
        const wrappedState = existingState && typeof existingState === 'object' && 'routePayload' in existingState
            ? existingState
            : {};

        wrappedState.routePayload = routePayload;
        writeSessionState(wrappedState);
    } catch {
        // ignore session storage issues
    }
}

export function loadRoutePayload() {
    try {
        const parsed = readSessionState();
        if (!parsed) {
            return null;
        }

        if (typeof parsed === 'object' && 'routePayload' in parsed) {
            return parsed.routePayload ?? null;
        }

        return parsed;
    } catch {
        return null;
    }
}

export function saveRouteUiState(uiState) {
    try {
        const existingState = readSessionState();
        const wrappedState = existingState && typeof existingState === 'object' && 'routePayload' in existingState
            ? existingState
            : { routePayload: existingState ?? null };

        wrappedState.uiState = uiState ?? null;
        writeSessionState(wrappedState);
    } catch {
        // ignore session storage issues
    }
}

export function loadRouteUiState() {
    try {
        const parsed = readSessionState();
        if (!parsed || typeof parsed !== 'object' || !('routePayload' in parsed)) {
            return null;
        }

        return parsed.uiState ?? null;
    } catch {
        return null;
    }
}

export function clearRoutePayload() {
    try {
        sessionStorage.removeItem(ROUTE_SESSION_KEY);
    } catch {
        // ignore session storage issues
    }
}

export function isNarrowScreen() {
    return window.matchMedia('(max-width: 900px)').matches;
}
