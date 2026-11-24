// Editable language examples. Every check compiles and executes the actual source.
export const examples = [
  {
    id: "01_variables", title: "Variables and types", features: ["Variables", "Types", "Output"],
    description: "Store text, whole numbers, decimals, booleans and a constant.",
    inputs: [], expected: "Naalo: Farhan\nUmar: 20\nFeesad: 87.5\nTayar: ha\nHad: 100\n",
    code: `// Variables have declared types. Text goes inside quotes.
lafz naalo = "Farhan"
adad umar = 20
dec feesad = 87.5
isharo tayar = ha
pakko adad HAD = 100

budhai "Naalo: " + naalo
budhai "Umar: " + umar
budhai "Feesad: " + feesad
budhai "Tayar: " + tayar
budhai "Had: " + HAD
`,
  },
  {
    id: "02_conditions", title: "Input and conditions", features: ["Input", "If / else", "Comparisons"],
    description: "Read a percentage and select a grade. Strict thresholds: >90 A, >70 B, >50 C.",
    inputs: [75], expected: "Feesad: B\n", result: "B",
    code: `// budh reads input; budhai prints output.
dec feesad = budh("Feesad: ")

jey (feesad < 0 || feesad > 100) {
    budhai "Feesad 0 kha 100 taeen likho."
} na_ta jey (feesad > 90) {
    budhai "A"
} na_ta jey (feesad > 70) {
    budhai "B"
} na_ta jey (feesad > 50) {
    budhai "C"
} na_ta {
    budhai "F"
}
`,
  },
  {
    id: "03_loops", title: "For, while and foreach", features: ["Loops", "Increment", "Arrays"],
    description: "Repeat with a counter, a condition and each item in an array.",
    inputs: [], expected: "Gin: 1\nGin: 2\nGin: 3\nWori: 1\nWori: 2\nWori: 3\nQatar: 10\nQatar: 20\nQatar: 30\n",
    code: `// Counter loop
gin (adad soochi = 1; soochi <= 3; soochi++) {
    budhai "Gin: " + soochi
}

// While loop
adad ang = 1
wori (ang <= 3) {
    budhai "Wori: " + ang
    ang++
}

// Foreach loop
qatar adad ang_a = [10, 20, 30]
gin hik andar ang_a {
    budhai "Qatar: " + hik
}
`,
  },
  {
    id: "04_functions", title: "Functions and recursion", features: ["Functions", "Parameters", "Return values"],
    description: "Call reusable typed functions and a recursive factorial function.",
    inputs: [], expected: "Jor: 12\nFactorial: 120\n",
    code: `kam jor(adad pheru, adad biyo) -> adad {
    wapas pheru + biyo
}

kam factorial(adad ang) -> adad {
    jey (ang <= 1) { wapas 1 }
    wapas ang * factorial(ang - 1)
}

budhai "Jor: " + jor(7, 5)
budhai "Factorial: " + factorial(5)
`,
  },
  {
    id: "05_arrays", title: "Dynamic and nested arrays", features: ["Arrays", "Indexing", "Arithmetic"],
    description: "Append, remove and update values, then calculate their total.",
    inputs: [], expected: "Kadhyal: 20\nTadaad: 3\nKul: 85\nMatrix: 9\n",
    code: `qatar adad nishan = [10, 20, 30]
nishan.joryo(40)
nishan[0] = 15
adad kadhyal = nishan.kadh(1)

adad kul = 0
gin ang andar nishan { kul += ang }

qatar qatar adad matrix = [[1, 2], [3, 4]]
matrix[1][0] = 9

budhai "Kadhyal: " + kadhyal
budhai "Tadaad: " + nishan.lambai
budhai "Kul: " + kul
budhai "Matrix: " + matrix[1][0]
`,
  },
  {
    id: "06_objects", title: "Classes and independent objects", features: ["Classes", "Objects", "Methods"],
    description: "Construct two objects with separate state and call a method through paan.",
    inputs: [], expected: "Farhan: 90\nPaas: ha\nAli: 0\nPaas: na\n",
    code: `qism Talib {
    lafz naalo = "Farhan"
    adad nishan = 0

    kam joryo(adad ang) -> Talib {
        paan.nishan += ang
        wapas paan
    }
    kam paas() -> isharo {
        wapas paan.nishan >= 50
    }
}

Talib pheru = naon Talib("Farhan", 86)
Talib biyo = naon Talib("Ali")
pheru.joryo(4)

qatar Talib talib_a = [pheru, biyo]
gin hik andar talib_a {
    budhai hik.naalo + ": " + hik.nishan
    budhai "Paas: " + hik.paas()
}
`,
  },
  {
    id: "07_marksheet", title: "Complete marksheet", features: ["Variables", "Conditions", "Loops", "Functions", "Arrays", "Objects"],
    description: "Choose the subject count at runtime. An object stores marks; methods and a function calculate results.",
    inputs: ["Farhan", 3, 90, 80, 70],
    expected: "Naalo: Ketira mazmoon? Mazmoon 1 (0-100): Mazmoon 2 (0-100): Mazmoon 3 (0-100): \nNaalo: Farhan\nMazmoon: 3\nKul: 240\nFeesad: 80%\nAusat: 80\nDarjo: B\n",
    result: "Naalo: Farhan\nMazmoon: 3\nKul: 240\nFeesad: 80%\nAusat: 80\nDarjo: B",
    code: `// All six high-level features work together in this program.
// Try these inputs: Farhan, 3, 90, 80, 70.
qism Marksheet {
    lafz naalo = ""
    dec had = 100.0
    qatar dec nishan = []

    kam joryo(dec ang) { paan.nishan.joryo(ang) }
    kam kul() -> dec {
        dec natijo = 0.0
        gin ang andar paan.nishan { natijo += ang }
        wapas natijo
    }
    kam ausat() -> dec {
        jey (paan.nishan.lambai == 0) { wapas 0.0 }
        wapas paan.kul() / paan.nishan.lambai
    }
    kam feesad() -> dec {
        jey (paan.nishan.lambai == 0) { wapas 0.0 }
        wapas paan.kul() * 100.0 / (paan.nishan.lambai * paan.had)
    }
}

kam darjo(dec feesad) -> lafz {
    jey (feesad > 90) { wapas "A" }
    na_ta jey (feesad > 70) { wapas "B" }
    na_ta jey (feesad > 50) { wapas "C" }
    wapas "F"
}

kam nishan_watho(lafz sawal, dec had) -> dec {
    dec ang = -1.0
    wori (ang < 0 || ang > had) {
        azmai { ang = budh(sawal) }
        pakar (maslo) { budhai "Sahi ang likho." }
        jey (ang < 0 || ang > had) { budhai "Marks 0 kha " + had + " taeen likho." }
    }
    wapas ang
}

lafz naalo = budh("Naalo: ")
adad tadaad = 0
wori (tadaad <= 0) {
    azmai { tadaad = budh("Ketira mazmoon? ") }
    pakar (maslo) { budhai "Sahi adad likho." }
    jey (tadaad <= 0) { budhai "Hik ya vadheek mazmoon likho." }
}

Marksheet natijo = naon Marksheet(naalo)
gin (adad soochi = 0; soochi < tadaad; soochi++) {
    dec ang = nishan_watho("Mazmoon " + (soochi + 1) + " (0-" + natijo.had + "): ", natijo.had)
    natijo.joryo(ang)
}

budhai ""
budhai "Naalo: " + natijo.naalo
budhai "Mazmoon: " + natijo.nishan.lambai
budhai "Kul: " + natijo.kul()
budhai "Feesad: " + natijo.feesad() + "%"
budhai "Ausat: " + natijo.ausat()
budhai "Darjo: " + darjo(natijo.feesad())
`,
  },
];

export const exampleFile = example => ({ path: example.id + ".jimsabz", text: example.code, kind: "source" });
