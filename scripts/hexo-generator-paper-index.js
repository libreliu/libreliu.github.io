'use strict';

const pagination = require('hexo-pagination');

hexo.extend.generator.register('paper-index', function(locals) {
    // Filter out all paper reading pages
    const paperReadingPosts = locals.posts.filter((val, idx) => val.layout == 'paper-reading');
    // console.debug(paperReadingPosts);

    // pagination can generate things like posts, prev & next, which
    // is useful for theme rendering
    return pagination("/paper-summary", paperReadingPosts, {
        perPage: 20,
        layout: ['paper-summary']
    });

    // return {
    //     path: "/paper-summary.html",
    //     data: paperReadingPosts,
    //     layout: ['paper-summary']
    // };

});

// hexo.extend.generator.register('paper-index', function(locals) {
//     const config = this.config;
//     const perPage = config.category_generator.per_page;
//     const paginationDir = config.pagination_dir || 'page';
//     const orderBy = config.category_generator.order_by || '-date';
  
//     return locals.categories.reduce((result, category) => {
//       if (!category.length) return result;
  
//       const posts = category.posts.sort(orderBy);
//       const data = pagination(category.path, posts, {
//         perPage,
//         layout: ['category', 'archive', 'index'],
//         format: paginationDir + '/%d/',
//         data: {
//           category: category.name
//         }
//       });
  
//       return result.concat(data);
//     }, []);
// });