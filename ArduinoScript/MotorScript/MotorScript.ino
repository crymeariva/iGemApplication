#include <Wire.h>

#define SLAVE_ADDRESS 0x04

/*  Pin definitions for all axes  */
const int enPin = 8;

// X axis
const int stepXPin = 2;
const int dirXPin  = 5;

// Y axis
const int stepYPin = 3;
const int dirYPin  = 6;

// Z axis
const int stepZPin = 4;
const int dirZPin  = 7;

// A axis - Currently Doesnt work with my Sheild
//Testing Needed here
const int stepAPin = 12; // change if different
const int dirAPin  = 13; // change if different

/*  Motor timing  */
const int pulseWidthMicros = 100;   // step pulse width
const int millisBtwnSteps  = 1000;  // delay between steps (µs)

/*  Command queue  */
#define QUEUE_SIZE 10

struct MotorCommand {
  char axis;       // X/Y/Z/A
  bool direction;  // true = down, false = up
  int steps;       // Testing todo to get rough amount to syringe measure's
};

MotorCommand commandQueue[QUEUE_SIZE];
//Lets this break out of loop(), and interrupts
//Will need testing if we want to move away from this for corruption reasons
volatile int queueHead = 0;
volatile int queueTail = 0;

/*  Queue helpers  */
bool queueIsEmpty() { return queueHead == queueTail; }
bool queueIsFull() { return ((queueTail + 1) % QUEUE_SIZE) == queueHead; }

bool enqueueCommand(char axis, bool direction, int steps) {
  if (queueIsFull()) return false;
  commandQueue[queueTail] = {axis, direction, steps};
  queueTail = (queueTail + 1) % QUEUE_SIZE;
  return true;
}

bool dequeueCommand(MotorCommand &cmd) {
  if (queueIsEmpty()) return false;
  cmd = commandQueue[queueHead];
  queueHead = (queueHead + 1) % QUEUE_SIZE;
  return true;
}

/*  Axis selection helper  */
int stepPin;
int dirPin;

bool selectAxis(char axis) {
  switch (axis) {
    case 'X':
      stepPin = stepXPin; dirPin = dirXPin; break;
    case 'Y':
      stepPin = stepYPin; dirPin = dirYPin; break;
    case 'Z':
      stepPin = stepZPin; dirPin = dirZPin; break;
    case 'A':
      stepPin = stepAPin; dirPin = dirAPin; break;
    default:
      return false;
  }
  pinMode(stepPin, OUTPUT);
  pinMode(dirPin, OUTPUT);
  return true;
}

/*  Setup  */
void setup() {
  Wire.begin(SLAVE_ADDRESS); //Basic Default Address
  Wire.onReceive(receiveData);

  pinMode(enPin, OUTPUT);
  digitalWrite(enPin, LOW); // enable motors
}

/*  Main loop  */
void loop() {
  delay(10); //We can speed this up later
 static bool busy = false;
  static MotorCommand currentCmd;
  static int stepsRemaining = 0;

  if (!busy) {
    if (dequeueCommand(currentCmd)) {
      if (!selectAxis(currentCmd.axis)) return;
      digitalWrite(dirPin, currentCmd.direction ? HIGH : LOW);
      stepsRemaining = currentCmd.steps;
      busy = true;
    }
  }

  if (busy && stepsRemaining > 0) {
    digitalWrite(stepPin, HIGH);
    delayMicroseconds(pulseWidthMicros);
    digitalWrite(stepPin, LOW);
    delayMicroseconds(millisBtwnSteps);
    stepsRemaining--;
  }

  if (busy && stepsRemaining == 0) busy = false;
}

/*  I2C receive handler  */
void receiveData(int howMany) {
  String received = "";

  // Cleaning Info, Removing dead bits
  if (Wire.available()) Wire.read(); // discard register byte
  while (Wire.available()) received += (char)Wire.read();
  received.trim();
  if (received.length() < 5) return; // minimal valid "X up 1"

  // Parse axis, direction, steps
  char axis = received.charAt(0);
  int firstSpace = received.indexOf(' ');
  int secondSpace = received.indexOf(' ', firstSpace + 1);
  if (firstSpace == -1 || secondSpace == -1) return;

  String dirStr = received.substring(firstSpace + 1, secondSpace);
  String stepsStr = received.substring(secondSpace + 1);
  int steps = stepsStr.toInt();
  if (steps <= 0) return;

  bool direction = false;
  if (dirStr == "down") direction = true;
  else if (dirStr == "up") direction = false;
  else return;

  enqueueCommand(axis, direction, steps);
}

