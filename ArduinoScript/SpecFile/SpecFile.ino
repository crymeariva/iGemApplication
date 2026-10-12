const int sensorPin = A5;
const float VREF = 5.0;
const int ADC_MAX = 1023;   // if values exceed 1023

void setup() {
    Serial.begin(115200);
}

void loop() {
    int raw = analogRead(sensorPin);
    float voltage = raw * VREF / ADC_MAX;

    Serial.print("Raw = ");
    Serial.print(raw);
    Serial.print("   Voltage = ");
    Serial.println(voltage, 4);

    delay(100);
}
