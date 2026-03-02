import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const revalidate = 0;

export async function GET() {
    try {
        // The project root is two levels up from 'frontend/.next' during runtime in some cases,
        // but typically 'process.cwd()' in Next.js is the 'frontend' directory.
        // We look for the CSV in the parent directory of 'frontend'.
        const rootPath = path.join(process.cwd(), '..');
        const csvPath = path.join(rootPath, 'price_history.csv');

        if (!fs.existsSync(csvPath)) {
            return NextResponse.json({ history: [] });
        }

        const data = fs.readFileSync(csvPath, 'utf8');
        const lines = data.split('\n');

        // Skip header and empty lines
        const history = lines.slice(1)
            .filter(line => line.trim() !== '')
            .map(line => {
                const [timestamp, price] = line.split(',');
                return {
                    time: parseInt(timestamp),
                    value: parseFloat(price)
                };
            });

        return NextResponse.json({ history });
    } catch (err: any) {
        console.error("Error reading price history:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
