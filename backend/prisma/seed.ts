import prisma from '../src/db/client';

async function main() {
  // 🔹 Top-level categories and their subcategories
  const categories = [
        {
          name: 'Humor & Internet Culture',
          subCategories: [
            'Memes & Viral Trends',
            'Dank Memes',
            'Copypastas & Inside Jokes',
            'Emoji Tokens',
            'Cursed & Absurd Tokens',
            'Meme Hybrids'
          ],
        },
        {
          name: 'Animals',
          subCategories: [
            'Dogs',
            'Cats',
            'Frogs',
            'Birds',
            'Fish & Sea Creatures',
            'Reptiles',
            'Insects',
            'Mythical Creatures'
          ],
        },
        {
          name: 'PolitiFi & Society',
          subCategories: [
            'US Politics',
            'World Leaders',
            'Political Movements',
            'Satire & Commentary',
            'Stock Market Parodies',
            'Everyday Struggles',
            'Jobs & Professions'
          ],
        },
        {
          name: 'AI, Tech & Future',
          subCategories: [
            'Artificial Intelligence',
            'Robotics',
            'Virtual Reality',
            'Big Tech Parodies',
            'Software & Apps',
            'Sci-Fi & Space',
            'Post-Apocalyptic Themes'
          ],
        },
        {
          name: 'Gaming & eSports',
          subCategories: [
            'P2E (Play-to-Earn)',
            'GameFi',
            'Major Gaming Titles',
            'Game Characters',
            'Esports Teams'
          ],
        },
        {
          name: 'Culture & Celebrities',
          subCategories: [
            'Musicians & Artists',
            'Actors & Directors',
            'Internet Celebrities',
            'TV Shows',
            'Movies',
            'Fashion & Streetwear',
            'Fitness & Gym Culture'
          ],
        },
        {
          name: 'Sports',
          subCategories: [
            'Football (Soccer)',
            'American Football',
            'Basketball',
            'Baseball',
            'Fighting Sports',
            'Olympics',
            'Teams & Clubs',
            'Athletes'
          ],
        },
        {
          name: 'Food, Drinks & Lifestyle',
          subCategories: [
            'Fast Food',
            'Snacks & Candy',
            'Fruits & Vegetables',
            'Coffee & Tea',
            'Restaurants',
            'Travel & Backpackers',
            'Hobbies & Passions'
          ],
        },
        {
          name: 'Geography & Nature',
          subCategories: [
            'Countries',
            'Cities',
            'US States',
            'Weather Phenomena',
            'Natural Wonders'
          ],
        },
        {
          name: 'DeFi & Crypto',
          subCategories: [
            'DEX Tokens',
            'Lending Protocols',
            'Oracle Networks',
            'Major Crypto Parodies',
            'NFT Projects',
            'Platform Tokens'
          ],
        },
        {
          name: 'Seasonal & Events',
          subCategories: [
            'Christmas',
            'Halloween',
            'New Year',
            'Meme Holidays'
          ],
        },
        {
          name: 'Abstract & Meta',
          subCategories: [
            'Number Tokens',
            'Word Tokens',
            'Concept Tokens'
          ],
        },
      ];


  for (const cat of categories) {
    await prisma.category.create({
      data: {
        name: cat.name,
        subCategories: {
          create: cat.subCategories.map((subName) => ({ name: subName })),
        },
      },
    });
  }

  console.log('✅ Categories and subcategories seeded successfully');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
