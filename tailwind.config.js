/** @type {import('tailwindcss').Config} */
export default {
	content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
	theme: {
		extend: {
			colors: {
				shop: {
					navy: "#16395b",
					blue: "#1b4965",
					dark: "#0e243a",
					cream: "#f4ebda",
					"cream-light": "#fbf8f1",
					"cream-dark": "#e2d6bf",
					green: "#2d5a3f",
					rust: "#983b32",
					gold: "#c99a45",
				},
			},
			fontFamily: {
				display: ['"Bebas Neue"', '"Barlow Condensed"', "sans-serif"],
				heading: ['"Oswald"', "sans-serif"],
				sans: ['"Plus Jakarta Sans"', "system-ui", "sans-serif"],
			},
		},
	},
	plugins: [],
};
