Add-Type -AssemblyName System.Speech

function Generate-Audio($text, $filePath) {
    $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
    $synth.Rate = 0
    $synth.Volume = 100
    $synth.SetOutputToWaveFile($filePath)
    $synth.Speak($text)
    $synth.Dispose()
    Write-Host "Generated: $filePath ($((Get-Item $filePath).Length) bytes)"
}

# 1. Sound check
$soundCheckText = "This is an official sound check for the IELTS Listening test. If you can hear this recording clearly, your headphones are working properly and you may proceed with the examination."
Generate-Audio $soundCheckText "frontend/public/audio/sound-check.wav"
Copy-Item "frontend/public/audio/sound-check.wav" "Backend/uploads/audio/sound-check.wav"

# 2. Section 1
$sec1Text = @"
IELTS Listening Practice Test. Section 1. You will hear a telephone conversation between an international student, Sara Henderson, and a university housing officer regarding student accommodation. First, you have some time to look at Questions 1 to 5.
Now listen carefully and answer Questions 1 to 5.
Good morning, University Student Housing Office. How can I help you today?
Hello, my name is Sara Henderson, and I am an incoming postgraduate student looking to secure on-campus accommodation.
Certainly, Sara. Let me take down your details. What is your student identification code?
My student ID is S H 7 4 9 2.
Thank you. And what type of room are you looking for? We have standard single rooms, twin shared rooms, and en-suite rooms with a private bathroom.
I would definitely prefer an en-suite room if one is available.
Great, we have availability in en-suite. And what is your expected lease duration?
I will be enrolled for the standard academic year, so nine months would be ideal.
Noted, nine months. When do you plan to move in?
My flights arrive on September 14th, so my preferred move-in date is September 15th.
Perfect. Before we continue, you have some time to look at Questions 6 to 10.
Now listen and answer Questions 6 to 10.
Now regarding dining, do you prefer self-catering or one of our meal plans?
I would like the half-board meal plan, providing breakfast and dinner on weekdays.
Very well. There is a refundable security deposit of 250 pounds required upon reservation.
That is fine. Can you put me down for Greenwood Hall? My sister stayed there two years ago.
Yes, Greenwood Hall still has three en-suite rooms open. Would you be paying by bank transfer or credit card?
I can pay right now by credit card.
Excellent. Who is your primary emergency contact?
My brother, David Henderson.
And do you have any special living requests?
Yes, as I am doing intensive thesis research, I would prefer to be placed on a quiet floor.
That can easily be arranged. Thank you, Sara. We will send the confirmation email shortly.
That is the end of Section 1.
"@
Generate-Audio $sec1Text "frontend/public/audio/ielts-listening-section1.wav"
Copy-Item "frontend/public/audio/ielts-listening-section1.wav" "Backend/uploads/audio/ielts-listening-section1.wav"

# 3. Section 2
$sec2Text = @"
Section 2. You will hear an orientation talk given by a senior librarian, Mr. Arthur Collins, introducing new members to the city cultural library and its digital learning facilities. First, you have some time to look at Questions 11 to 15.
Now listen carefully and answer Questions 11 to 15.
Welcome everyone to the City Central Library and Cultural Center. My name is Arthur Collins, and today I want to guide you through our collections, borrowing policies, and study facilities.
First, regarding library hours: our main reading halls are open Monday through Friday from 8:30 AM to 9:00 PM, and on weekends from 10:00 AM to 6:00 PM. Please note that during the summer holiday period, we close at 5:00 PM on Sundays.
As a registered member, you are allowed to borrow up to ten physical books simultaneously for a period of three weeks. If you require extra time, renewal can be completed online twice, provided no other borrower has reserved the title. Overdue items incur a daily late fee of 50 pence per volume.
Before we look at the building layout, you have some time to look at Questions 16 to 20.
Now listen and answer Questions 16 to 20.
Now let me highlight five key facilities across our floors.
On the Ground Floor, immediately beside the main entrance, you will find our Multimedia Center. This contains thirty high-speed computers equipped with audio editing and language learning software.
Moving up to the First Floor, the Eastern Wing houses the Archive and Rare Books Collection. Access here requires advance booking and a photo ID.
Opposite the archives on the First Floor is the Silent Study Zone. Mobile phones must be switched off completely in this area.
On the Second Floor, we have the Collaborative Project Hub, equipped with whiteboards and display screens for group presentations.
Finally, in the Basement level, you will find the Family Reading Room and Children's Discovery Corner, open every afternoon.
That is the end of Section 2.
"@
Generate-Audio $sec2Text "frontend/public/audio/ielts-listening-section2.wav"
Copy-Item "frontend/public/audio/ielts-listening-section2.wav" "Backend/uploads/audio/ielts-listening-section2.wav"

# 4. Section 3
$sec3Text = @"
Section 3. You will hear a tutoring discussion between two university students, Jack and Emily, and their academic supervisor, Dr. Watson, regarding their field research project on renewable solar energy. First, you have some time to look at Questions 21 to 25.
Now listen carefully and answer Questions 21 to 25.
Come in Jack, Emily, please take a seat. How is your preparatory work coming along for the solar panel efficiency research?
Well Dr. Watson, we have analyzed the initial meteorological data from the three regional test stations, but we noticed significant discrepancies in the temperature coefficients.
That is quite common, Jack. What did your regression model indicate?
The regression showed that panel overheating reduced electrical output by nearly twelve percent during peak afternoon sunlight hours.
Indeed. That aligns with current research in photovoltaic degradation. What do you propose as your primary mitigation strategy?
Emily and I want to investigate water-cooling microchannels installed directly behind the crystalline silicon cells.
That sounds promising. Have you considered the pumping energy costs?
Yes, we plan to utilize gravity-assisted siphon mechanisms to minimize supplementary power consumption.
Now you have some time to look at Questions 26 to 30.
Now listen and answer Questions 26 to 30.
Let us outline the five stages of your upcoming field experiment.
Stage one will be sensor calibration: ensuring all thermal and voltage probes read within one-tenth of a percent accuracy.
Stage two is ambient baseline measurement: recording solar irradiance without artificial cooling for a full forty-eight-hour cycle.
Stage three introduces continuous fluid circulation at three distinct flow rates.
Stage four is comparative thermal imaging using our department's infrared camera to detect hotspot formations.
And stage five will be statistical error analysis using the Monte Carlo simulation package.
Sounds like a rigorous protocol. Submit your revised hypothesis document by Friday afternoon.
Thank you, Dr. Watson.
That is the end of Section 3.
"@
Generate-Audio $sec3Text "frontend/public/audio/ielts-listening-section3.wav"
Copy-Item "frontend/public/audio/ielts-listening-section3.wav" "Backend/uploads/audio/ielts-listening-section3.wav"

# 5. Section 4
$sec4Text = @"
Section 4. You will hear an academic lecture on marine biology, focusing on the mechanisms of ocean acidification and its ecological consequences on global coral reef ecosystems. First, you have some time to look at Questions 31 to 40.
Now listen carefully and answer Questions 31 to 40.
Good afternoon, students. Today we examine one of the most critical anthropogenic threats to marine biodiversity: ocean acidification.
Since the onset of the industrial revolution, atmospheric concentrations of carbon dioxide have risen exponentially, primarily from the combustion of fossil fuels and extensive deforestation. Approximately thirty percent of this anthropogenic carbon dioxide is absorbed directly by the world's oceans.
When carbon dioxide dissolves in seawater, it initiates a series of chemical reactions producing carbonic acid. This process liberates hydrogen ions, which subsequently bind with carbonate ions. The consequence is a substantial depletion of carbonate ions available for marine calcifiers.
Organisms such as hard corals, mollusks, and pteropods depend on carbonate ions to build and maintain their calcium carbonate skeletons. In water with lower saturation states, these skeletal structures become brittle and may even begin to dissolve.
Coral reefs in tropical shallow water are particularly vulnerable. A drop in seawater pH impairs the calcification rate of reef-building scleractinian corals. Concurrently, elevated sea surface temperatures induce coral bleaching, wherein corals expel their vital symbiotic algae, known as zooxanthellae.
The loss of reef structural complexity causes devastating cascades throughout marine biodiversity. Over a quarter of all marine species rely on healthy coral formations for feeding, shelter, and breeding grounds.
Furthermore, coastal communities face heightened risks: living barrier reefs dissipate up to ninety-seven percent of wave energy, protecting shorelines against storm surges and coastal erosion. Overfishing of herbivorous fish species compounds the dilemma by allowing macroalgae to outcompete struggling coral recruits.
To foster ecological resilience, scientists are trialing artificial reefs and selective coral breeding programs. Nonetheless, international treaties enforcing rapid decarbonization remain the only viable long-term solution.
That is the end of Section 4 and the complete IELTS Listening Test.
"@
Generate-Audio $sec4Text "frontend/public/audio/ielts-listening-section4.wav"
Copy-Item "frontend/public/audio/ielts-listening-section4.wav" "Backend/uploads/audio/ielts-listening-section4.wav"
