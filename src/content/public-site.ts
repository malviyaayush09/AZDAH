export const OFFERINGS = [
  {
    num: '01',
    title: 'Pole Art',
    desc: 'Choreography, flow and storytelling — find your voice and express yourself on the pole.',
  },
  {
    num: '02',
    title: 'Pole Fitness',
    desc: 'Spins, climbs, inverts and tricks. Build serious strength, control and stamina.',
  },
  {
    num: '03',
    title: 'Pole Exotic',
    desc: 'Heels, floorwork and sensual movement. Reclaim your sensuality on your own terms.',
  },
  {
    num: '04',
    title: 'Flexibility',
    desc: 'Splits, backbends and mobility work that safely opens up your range over time.',
  },
  {
    num: '05',
    title: 'Strength Training',
    desc: 'Conditioning built around one goal — the power to pull your own weight up.',
  },
  {
    num: '06',
    title: 'Mindfulness',
    desc: 'Move with intention. Leave judgment and comparison at the door.',
  },
] as const;

export const PHILOSOPHY = [
  ['01', 'Sensual', 'Sensuality isn’t something you perform. It’s something you reclaim.'],
  ['02', 'Strong', 'Real strength isn’t only measured by muscles — it’s being able to pull your own weight up. Pole builds full-body strength, plus the courage, consistency and confidence to try again.'],
  ['03', 'Poised', 'Move because it feels good. Dance because you can. Take up space without asking permission.'],
] as const;

export const FAQS = [
  { q: 'Do I need prior experience to start?', a: "None at all. Most of our students began with zero pole experience. Your coach meets you exactly where you are — it isn't important that you just started, it's important that you started at all." },
  { q: 'Who is AZDAH for?', a: 'AZDAH is a women and queer-first pole studio — a space built to feel safe and welcoming, free of judgment or comparison. No experience required, no perfect body required.' },
  { q: 'How do classes and packs work?', a: 'AZDAH runs on class packs, not monthly memberships. Choose a pack — Pole, Self-Practice, Mobility, Strength or a Combo — and book the sessions that suit you. No hidden fees, no auto-renewal.' },
  { q: 'What should I wear to class?', a: 'Shorts, with a crop top or sports bra. You need skin contact to grip the pole.' },
  { q: 'What if I miss a class I booked?', a: 'Reschedules and cancellations must be told to us at least 6 hours before the class starts. One reschedule a month is allowed. There are no refunds or extensions once a class pack has been purchased. One class on your pack can be rescheduled — please do this at least six hours of class or it won’t be possible. Class packs are valid for four weeks, with no transfers and no extensions beyond four weeks. If you are unsure about your timings, we urge you to take a smaller class pack and buy only for the classes you know you can be fully present for.' },
  { q: 'Is the payment secure?', a: 'All payments are processed through Razorpay with 256-bit SSL encryption. We never store your card details.' },
] as const;

export const TESTIMONIALS = [
  {
    quote: "This is a great place to learn pole from. Azdah is very encouraging and great at teaching. Everything I know in pole is because of her. She's helped me gain strength, flexibility and confidence… The studio is extremely well maintained. It's clean, has AC and really good quality equipment. I highly recommend learning from here!",
    name: 'Nimisha Sharma',
    role: 'Google review',
  },
  {
    quote: "Training with Azdah has been nothing short of amazing. Exactly a year apart, I achieved my split and then my Ayesha — something I never thought possible when I first started. Her patience, encouragement, and incredible teaching skills make every class empowering. Couldn't have asked for a better pole teacher!",
    name: 'Rakhi Ranjan',
    role: 'Google review',
  },
  {
    quote: "I've been taking classes with Azdah for a while now, and she's truly the best. Every session feels like a mix of strength, grace, and fun. She's incredibly patient and attentive, always making sure we understand the moves and can do them safely… Whether you're a beginner or have been at it for years, she knows exactly how to challenge you and help you grow.",
    name: 'Sneh Ratna',
    role: 'Google review',
  },
] as const;

export const PHOTO_SEQUENCE = [
  { src: '/_CAL8691.JPG', label: 'Pole Art', sub: 'Flow & artistry', alt: 'Azdah holding a full split beside the pole in the studio' },
  { src: '/_CAL8738.JPG', label: 'Pole Fitness', sub: 'Spins & inverts', alt: 'Azdah training an inverted floor movement beside the pole' },
  { src: '/_CAL8706.JPG', label: 'Flexibility', sub: 'Splits & backbends', alt: 'Azdah holding a full split and looking towards the camera' },
  { src: '/azdah-hero.jpg', label: 'Community', sub: 'Choosing themselves', alt: 'Azdah seated high on the pole in the studio' },
] as const;

export const CONTACT_DETAILS = [
  { label: 'Studio', text: 'AZDAH, AU Small Finance Bank (3rd floor)\n10/3, Jeevan Bima Nagar Main Rd\nLIC Colony, Sector 11, New Thippasandra\nBengaluru, Karnataka 560075' },
  { label: 'Hours', text: 'Mon – Sat: 6:00 AM – 9:00 PM\nSunday: 7:00 AM – 2:00 PM' },
  { label: 'WhatsApp', text: '+91 85880 56122' },
  { label: 'Email', text: 'hello@azdahfit.in' },
] as const;
