export function parseFlexibleDate(
    input: string,
    referenceDate: Date = new Date(),
): Date | null {
    const trimmed = input.trim().toLowerCase();
    if (!trimmed) {
        return null;
    }

    const isoDate = new Date(trimmed);
    if (
        !isNaN(isoDate.getTime()) &&
        trimmed.includes("-") &&
        trimmed.includes(":")
    ) {
        return isoDate;
    }

    const relativeMatch = trimmed.match(
        /^(\d+(?:\.\d+)?)\s*(h|heure|heures|m|min|minute|minutes)$/,
    );
    if (relativeMatch) {
        const val = parseFloat(relativeMatch[1]);
        const unit = relativeMatch[2];
        if (unit.startsWith("h")) {
            return new Date(referenceDate.getTime() - val * 3600 * 1000);
        } else {
            return new Date(referenceDate.getTime() - val * 60 * 1000);
        }
    }

    const hierMatch = trimmed.match(
        /^hier\s+(\d{1,2})[h:](\d{2})(?::(\d{2}))?$/,
    );
    if (hierMatch) {
        const hours = parseInt(hierMatch[1], 10);
        const minutes = parseInt(hierMatch[2], 10);
        const seconds = hierMatch[3] ? parseInt(hierMatch[3], 10) : 0;
        const d = new Date(referenceDate);
        d.setDate(d.getDate() - 1);
        d.setHours(hours, minutes, seconds, 0);
        return d;
    }

    const timeOnlyMatch = trimmed.match(/^(\d{1,2})[h:](\d{2})(?::(\d{2}))?$/);
    if (timeOnlyMatch) {
        const hours = parseInt(timeOnlyMatch[1], 10);
        const minutes = parseInt(timeOnlyMatch[2], 10);
        const seconds = timeOnlyMatch[3] ? parseInt(timeOnlyMatch[3], 10) : 0;
        const d = new Date(referenceDate);
        d.setHours(hours, minutes, seconds, 0);
        if (d.getTime() > referenceDate.getTime()) {
            d.setDate(d.getDate() - 1);
        }
        return d;
    }

    const frDateMatch = trimmed.match(
        /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2})[h:](\d{2})(?::(\d{2}))?)?$/,
    );
    if (frDateMatch) {
        const day = parseInt(frDateMatch[1], 10);
        const month = parseInt(frDateMatch[2], 10) - 1;
        const year = parseInt(frDateMatch[3], 10);
        const hours = frDateMatch[4] ? parseInt(frDateMatch[4], 10) : 0;
        const minutes = frDateMatch[5] ? parseInt(frDateMatch[5], 10) : 0;
        const seconds = frDateMatch[6] ? parseInt(frDateMatch[6], 10) : 0;
        const d = new Date(year, month, day, hours, minutes, seconds);
        return isNaN(d.getTime()) ? null : d;
    }

    const standardDateMatch = trimmed.match(
        /^(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{1,2})[h:](\d{2})(?::(\d{2}))?)?$/,
    );
    if (standardDateMatch) {
        const year = parseInt(standardDateMatch[1], 10);
        const month = parseInt(standardDateMatch[2], 10) - 1;
        const day = parseInt(standardDateMatch[3], 10);
        const hours = standardDateMatch[4]
            ? parseInt(standardDateMatch[4], 10)
            : 0;
        const minutes = standardDateMatch[5]
            ? parseInt(standardDateMatch[5], 10)
            : 0;
        const seconds = standardDateMatch[6]
            ? parseInt(standardDateMatch[6], 10)
            : 0;
        const d = new Date(year, month, day, hours, minutes, seconds);
        return isNaN(d.getTime()) ? null : d;
    }

    return null;
}
