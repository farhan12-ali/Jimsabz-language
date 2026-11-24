import fs from "node:fs";
import { build } from "../studio/agent/builders.mjs";
import { compile } from "../studio/core/compiler.mjs";
const prompts = {
  marks: [
    "take marks of three subjects and print total percentage and grade",
    "calculate student marks percentage and grades with if else",
    "write a result card program for three subjects",
    "input subject marks then show total and grade",
    "three subject percentage calculator with A B C and F grades",
    "make a complete marksheet program",
    "give A above 90 B above 70 C above 50 percent",
    "read exam scores and compute a report card",
    "marks input program with percentage and grade conditions",
    "calculate grades for three exam subjects",
    "ask for marks of 3 subjects each out of 100",
    "add subject scores and assign a letter grade by percentage",
  ],
  output: [
    "print a message",
    "show text in the console",
    "display a quoted name",
    "output hello world",
    "write Farhan on screen",
    "print one line",
    "show my name",
    "display terminal text",
    "budhai example",
    "budhai equals a name",
    "terminal greeting program",
    "show the output Farhan",
  ],
  input: [
    "ask the user for a name",
    "take a name as input",
    "read text from the terminal",
    "accept a string and say hello",
    "input a person name",
    "ask what is your name",
    "read user input",
    "prompt for text",
    "greet the user after input",
    "take keyboard text input",
    "name input example",
    "read a lafz",
  ],
  sum: [
    "add two numbers from user input",
    "calculate the sum of two integers",
    "ask for two numbers and add them",
    "make a number addition program",
    "total of two input values",
    "sum two user values",
    "addition calculator",
    "read two integers and show their sum",
    "input first and second number for addition",
    "add user numbers",
    "two number sum example",
    "sum calculator in terminal",
  ],
  condition: [
    "check if a number is positive",
    "write an if else condition",
    "use jey and na_ta",
    "positive or negative number test",
    "conditional number program",
    "branch using a condition",
    "compare input with zero",
    "if a value is greater than zero",
    "condition example",
    "ask for a value and check positive",
    "use an if statement",
    "choose output based on number",
  ],
  loop: [
    "repeat five times",
    "write a loop",
    "count from one to five",
    "use a for loop",
    "print numbers repeatedly",
    "gin loop example",
    "iterate five numbers",
    "repeat an action with gin",
    "show a counter in a loop",
    "count numbers in the terminal",
    "loop from 1 to 5",
    "repeat printing numbers",
  ],
  function: [
    "create a typed function",
    "write a function to add numbers",
    "use kam with a return value",
    "make a reusable addition function",
    "define a function and call it",
    "function example",
    "write kam and wapas",
    "return the total from a function",
    "add parameters in a function",
    "make a function for two values",
    "typed kam example",
    "function returning adad",
  ],
  array: [
    "make a typed array",
    "use qatar with numbers",
    "sum a list of values",
    "create an array and iterate",
    "list of integers example",
    "add all items in an array",
    "qatar adad example",
    "loop through an integer list",
    "store many values in array",
    "calculate list total",
    "iterate a qatar",
    "typed number list",
  ],
  player2d: [
    "create a controllable 2d player",
    "make a moving 2d character",
    "add an actor with arrow controls",
    "make a 2d square move",
    "use kirdar with arrow keys",
    "2d player movement example",
    "build a simple 2d character",
    "a player controlled with arrows",
    "create 2d object controls",
    "make an arrow controlled rectangle",
    "2d kirdar movement",
    "show an actor that I can move",
  ],
  scene3d: [
    "create a basic 3d scene",
    "show a cube in 3d",
    "make a 3d object with camera",
    "3d player with wasd",
    "build a simple 3d scene",
    "create a mujassamo cube",
    "3d camera and light example",
    "make a moving 3d cube",
    "basic khed3d scene",
    "render a three dimensional object",
    "create a 3d world",
    "show a 3d mesh and light",
  ],
  racing2d: [
    "make a simple 2d racing game",
    "create a car racing game",
    "build a 2d race with traffic",
    "make a road with moving cars",
    "generate a racing game with score",
    "create a car dodging game",
    "2d driving game with traffic",
    "make a racing game in the compiler",
    "build a simple race car game",
    "a 2d game to avoid traffic cars",
    "racing game with lives and score",
    "create a playable car racing game",
  ],
};
const seeds = {
  marks: [
    "write a simple program of input where user gives marks of three subjects and print sum percentage and grade if greater than 50 C greater than 70 B greater than 90 A",
    "three subjects ki marks percentage aur grade nikalo",
    "te mazmoon ja marks watho ain kul feesad darjo dikhaayo",
    "student result with strict greater than 90 A greater than 70 B greater than 50 C otherwise F",
  ],
  output: [
    "output a greeting",
    "print hello to the world",
    "display output text",
    "print the name Farhan",
  ],
  input: [
    "accept a string name",
    "say hello after reading a name",
    "get keyboard input text",
    "ask user input for a greeting",
  ],
  sum: [
    "addition of two input numbers",
    "a program to total two numbers",
    "add two integers",
    "show the result of addition",
  ],
  condition: [
    "test whether input is positive or negative",
    "if else example in a program",
    "use a comparison to choose a branch",
    "check a condition with jey",
  ],
  loop: [
    "for loop to print a sequence",
    "gin repeats an action",
    "use a counter to repeat",
    "iterate numbers with a for statement",
  ],
  function: [
    "define kam with two parameters",
    "return an addition result using wapas",
    "reusable typed function example",
    "write a named function",
  ],
  array: [
    "array values with typed qatar",
    "sum items stored in a list",
    "iterate through qatar values",
    "array of whole numbers",
  ],
  player2d: [
    "move a 2d square",
    "controllable square using arrow keys",
    "2d movement of a rectangle",
    "move a player actor",
  ],
  scene3d: [
    "cube mesh in a 3d world",
    "three dimensional scene with camera",
    "render a mujassamo",
    "3d object controlled by wasd",
  ],
  racing2d: [
    "traffic avoiding racing cars",
    "road driving race in 2d",
    "race a car with traffic and score",
    "play a simple car race",
  ],
};
const samples = [];
// Independent beginner phrasings. Code targets always use Jimsabz syntax.
const beginners = {
  marks: {
    train: [
      "te subjects ja marks input watho",
      "marks jo kul ain feesad nikalo",
      "pheru biyo teyo mazmoon ja marks jama karo ain grade dikhaayo",
      "complete student marks calculation with percentage and letter grade",
      "three subject marks prcenatge and Grade using if else conditions",
      "make a four subjects marksheet each out of 100",
    ],
    test: [
      "te mazmoon ja number lai feesad darjo budhayo",
      "generate a complete exam result from three marks inputs",
    ],
  },
  output: {
    train: [
      'write a simple program that prints "Farhan"',
      'make a basic program to display "Salam"',
      "write a simple program",
      "ek simple program likho",
      "mera naam screen par print karo",
      "console mein salam dikhao",
    ],
    test: [
      "ek asaan program banao jo naam dikhaye",
      "make a beginner program to print my name",
    ],
  },
  input: {
    train: [
      "write a simple program to take input from the user",
      "read my name and print it back",
      "ask my name in the console",
      "user se naam input lo",
      "naam pooch kar wapas dikhao",
      "terminal se lafz read karo",
    ],
    test: [
      "mera naam input le kar show karo",
      "make a beginner name input program",
    ],
  },
  sum: {
    train: [
      "write a simple program for the sum of two numbers",
      "make an addition program with user input",
      "calculate two numbers added together",
      "do numbers ka sum nikalo",
      "user se do adad lo aur jama karo",
      "do integers ki addition dikhao",
    ],
    test: [
      "do numbers input lekar jama kar do",
      "make a beginner two number addition calculator",
    ],
  },
  condition: {
    train: [
      "write a simple if else program",
      "ask a number and decide if it is positive",
      "show a message depending on a positive number test",
      "number positive hai ya negative check karo",
      "jey aur na_ta ki condition likho",
      "input value zero se bari hai check karo",
    ],
    test: [
      "ek number le kar positive negative batao",
      "a beginner conditional check for a positive value",
    ],
  },
  loop: {
    train: [
      "write a simple counting loop",
      "display numbers one through five",
      "repeat the print command in a loop",
      "gin loop se paanch numbers print karo",
      "ek se paanch tak ginti dikhao",
      "print ko baar baar repeat karo",
    ],
    test: [
      "loop laga kar one to five likho",
      "make a beginner program that repeats a counter",
    ],
  },
  function: {
    train: [
      "write a simple function example",
      "define an add function with two arguments",
      "call a function and display its return value",
      "do numbers jama karne ka function banao",
      "kam mein parameters aur wapas use karo",
      "ek reusable addition function likho",
    ],
    test: [
      "function ke andar sum karke wapas karo",
      "a beginner typed function that returns an addition",
    ],
  },
  array: {
    train: [
      "write a simple array example",
      "make a list of numbers and add each item",
      "iterate an array to calculate its total",
      "qatar mein adad store karo",
      "numbers ki list ka total nikalo",
      "array ke sab items ko jama karo",
    ],
    test: [
      "qatar ki values par loop chala kar sum karo",
      "a beginner integer array with a running total",
    ],
  },
};
async function add(intent, prompt, split) {
  const code = build(intent, prompt),
    r = await compile([{ path: "main.jimsabz", text: code }], "main.jimsabz");
  if (!r.ok) throw Error(JSON.stringify(r.diagnostics));
  samples.push({ intent, prompt, code, split });
}
for (const [intent, requests] of Object.entries(prompts))
  for (const [i, prompt] of requests.entries())
    for (const prefix of ["", "Please "])
      await add(
        intent,
        prefix + prompt + (i % 3 === 0 ? " in Jimsabz" : ""),
        i % 4 === 3 ? "test" : "train",
      );
for (const [intent, requests] of Object.entries(seeds))
  for (const prompt of requests) await add(intent, prompt, "train");
for (const [intent, splits] of Object.entries(beginners))
  for (const [split, requests] of Object.entries(splits))
    for (const prompt of requests) await add(intent, prompt, split);
const voiceRequests = {
  marks: [
    "تین مضامین کے نمبر لے کر فیصد اور گریڈ نکالو",
    "مارکس کا مجموعہ اور پرسنٹیج دکھاؤ",
    "ٽي مضمونن جا نشان وٺو ۽ ڪل ۽ گريڊ ڏيکاريو",
    "طالب علم کے نمبروں سے نتیجہ اور گریڈ بناؤ",
  ],
  sum: [
    "دو اعداد جمع کرو",
    "دو نمبر لے کر ان کا مجموعہ دکھاؤ",
    "ٻه انگ وٺو ۽ جمع ڪريو",
    "صارف سے دو عدد لے کر جمع کا جواب دو",
  ],
  condition: [
    "اگر عدد مثبت ہے تو بتاؤ ورنہ منفی بتاؤ",
    "اگر اور ورنہ کی شرط لکھو",
    "انگ مثبت يا منفي آهي ٻڌايو",
    "صفر سے بڑا یا چھوٹا عدد چیک کرو",
  ],
};
for (const [intent, requests] of Object.entries(voiceRequests))
  for (const [i, request] of requests.entries())
    await add(intent, request, i === 3 ? "test" : "train");
// Variable input counts and independent phrasings for the 0.5.0 capabilities.
const flexible = {
  marks: {
    train: [
      "write a marksheet for 7 subjects with percentage and average",
      "calculate total average and grade for twelve subjects",
      "read 1000 subject marks using a loop and qatar",
      "write a marksheet for satt subjects each out of 50",
      "let the user choose how many subjects at runtime",
      "marksheet with any number of subjects and average",
      '2 subjects; subjects: Math, English; percentage >= 90: A, >= 70: B, otherwise F',
      '7 sbects marks prcenatge average grade',
      'mark sheet for 24 subjects with total and average',
      'write marksheet using a reusable marks validation function',
      'read marks for 8 subjects and show per-subject percentage',
      'one hundred subjects with percentage and average',
    ],
    test: [
      "make a seven subject result with mean and overall percentage",
      "generate an exam sheet for 37 subjects each out of 80",
      "a report card that asks for the subject count first",
      "hazar mazmoon ja marks lai kul feesad ain ausat dikhaayo",
      "write marksheet for 11 subjects with >= 85: A, >= 60: B, else F",
      "make a semester marks sheet from a variable number of subjects",
    ],
  },
  statistics: {
    train: [
      "calculate total and average of 7 numbers",
      "read twelve values and show their mean",
      "sum and average of any number of inputs",
      "make a numeric statistics program",
      "ask how many numbers and calculate their average",
      "accept 1000 inputs in an array and calculate mean",
      "write a function processing many numbers with total and average",
      "qatar mein bohat adad lo aur ausat nikalo",
      "read 25 decimal inputs and output their total and mean",
      "runtime input count with a reusable total function",
      "average of eight user inputs",
      "sum 100 numbers from the keyboard",
      "add 11 numeric values from input",
      "seven adad jo kul ain ausat dikhaayo",
      "user chooses number of values to average",
      "a calculator for total and average of many values",
    ],
    test: [
      "find the arithmetic mean of 19 entered numbers",
      "accumulate 31 input values and print average",
      "take a variable number of values and report total and mean",
      "compute mean and sum for 87 values with a qatar",
      "ausat nikalo for 16 numbers from user",
      "build a calculator accepting however many values I need",
    ],
  },
  loop: {
    train: ["print Sindhi numbers from 1 to 1000", "show Roman Sindhi number words from 1 to 100", "count from 1 to 1000 in a gin loop", "print numbers from 15 to 30", "repeat 1000 times", "list the Sindhi counting words with a loop"],
    test: ["display Roman Sindhi counting from 5 through 20", "generate counting output from 1 to 587", "use a loop to output 700 number words"],
  },
};
for (const [intent,splits] of Object.entries(flexible))
  for (const [split,requests] of Object.entries(splits))
    for (const request of requests) await add(intent,request,split);
const objectRequests={
 train:["write a class and object example with user input","use qism with methods and an array field","make an object that totals a user chosen number of values","show classes objects arrays and functions together","write object oriented code to calculate average","create a class using field defaults and paan","make a class for sums of 7 numbers","use an object to store many numeric inputs","write reusable methods for array totals","show qism and naon with dynamic input","make an OOP calculator in Jimsabz","a class using its own method to calculate average","read 12 numbers into an object","make two fields and typed class methods","use a qism to calculate sum and mean"],
 test:["create an instance and invoke its numeric processing methods","write a class example accepting 19 values","an object program with an array for input data","demonstrate qism defaults and reusable object behavior","make an OOP average example with a runtime count"]
};
for(const [split,requests] of Object.entries(objectRequests))for(const request of requests)await add("objects",request,split);
// Independent account and percentage requests. Evaluation phrasing is kept out of training.
const professionalRequests = {
 percentage: {
  train: ["read two subject marks and calculate percentage", "take two inputs of marks and their precentage", "write a simple percentage calculator for two subjects", "calculate percentage from obtained marks and total marks", "could you write a program for two marks and percent", "make a percentage program with 4 subject inputs", "input five scores out of 50 and calculate percent", "use an array and function for marks percentage", "read three subject marks and show their combined percentage", "percentage of seven subject inputs with average", "input earned marks and maximum marks then show percentage", "do subjects ke marks aur percentage nikalo", "read twelve scores with a qatar and compute percent", "user chooses subject count at runtime for percentage", "write percentage code with numeric validation", "two inputs of scores percentage without grade"],
  test: ["accept a pair of exam scores and compute their percentage", "write a simple program in which the take the two inputs of the marks and their precentage", "could you please create a percent calculation for two subject inputs", "derive percent using scored marks and total possible marks", "read 17 subject scores and return combined percentage", "give me four-subject percentages using a reusable function"]
 },
 login: {
  train: ["build a local login system", "create a gaming hub with sign in", "write code for account registration and login", "make a native 3d gaming central hub with credentials", "login system with three attempts", "create a temporary user then verify sign in", "write a gaming dashboard with local authentication", "make a game launcher hub with registration and sign out", "generate a sign up and sign in demo", "gaming central login ui architecture", "local account credentials validation program", "create a gaming portal with profile and login", "write a login function that limits attempts", "3d hub account sign in and logout", "gaming hub with Home Arena Library Profile scenes", "build a local registration and login workflow"],
  test: ["write a code for login system for a gaming central system hub with ui architecture of 3d gaming credents", "could you implement a gaming center with registration and sign in", "create an account entry screen for a game collection hub", "native gaming lobby that requires login and supports logout", "construct a local sign-in demonstration with two attempts", "use temporary account verification before opening a three dimensional hub"]
 }
};
for (const [intent,splits] of Object.entries(professionalRequests))
  for (const [split,requests] of Object.entries(splits))
    for (const request of requests) await add(intent,request,split);
fs.mkdirSync("training", { recursive: true });
fs.writeFileSync(
  "training/curriculum.jsonl",
  samples.map((s) => JSON.stringify(s)).join("\n") + "\n",
);
console.log(
  `${samples.length} Jimsabz-only code samples validated by the compiler.`,
);
